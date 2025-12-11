"use strict";

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use("Model");
const Db = use("Database");
const Env = use("Env");
const internalIp = use("internal-ip");
const leftPad = use("left-pad");
const accounting = require("accounting");
const trim = use("trim");
const bluebird = require("bluebird");
const fs = require("fs");
const Helpers = use("Helpers");
const br_code = Env.get("BRANCH_CODE", "");
const spawn = require("child_process").spawn;
const _ = use("lodash");
const CustomException = use("App/Exceptions/CustomException");

const moment = require("moment");
const TO_DATE = Env.get("TO_DATE");

class RsMod extends Model {
  constructor() {
    super();
    this.Today = Db.fn.now();
    this.TodayTime = moment().format("YYYY-MM-DD HH:mm:ss");
    // this.TodayTime = moment().format('YYYY/MM/DD')
    this.branchCode = Env.get("BRANCH_CODE", "");
    this.branchName = Env.get("BRANCH_NAME", "");
  }

  async fetch_list_uom() {
    let row = await Db.connection("srspos").select("uom", "qty").from("uom");
    return row;
  }

  async fetch_list_branch() {
    let row = await Db.select("code", "name").from("transfers.0_branches");
    return row;
  }

  /**
   * @param {int} productid
   */
  async fetch_vendor(productid) {
    let row = await Db.connection("srspos")
      .select(
        "cost",
        "totalcost",
        "discountcode1",
        "discountcode2",
        "discountcode3",
        "vendorcode",
        "qty",
        "averagenetcost"
      )
      .from("vendor_products")
      .where("productid", productid)
      .andWhere("defa", 1);
    if (row.length == 0) {
      throw new CustomException(
        {
          message: `Vendor code doest not exist in vendor products ${productid}`,
        },
        401
      );
    }
    return row[0];
  }

  /**
   * @param {string} vendorcode
   * @param {int} status for rs number
   */
  async fetch_rs_id(vendorcode, status) {
    let row = await Db.select("rs_id")
      .from("0_rms_header")
      .where("supplier_code", vendorcode)
      .andWhere("pending", status)
      .andWhere("movement_no", status)
      .andWhere("rs_action", "!=", status);
    return row.length == 1 ? row[0].rs_id : 0;
  }

  /**
   * type 1 rs type 2 bo
   * @param {string} vendorcode
   * @param {int} barcode
   */
  async fetch_type_rs(vendorcode, barcode) {
    let row = await Db.select("tsuplier_code", "ttype")
      .from("0_return_type")
      .where("tsuplier_code", vendorcode);
    if (row.length == 0) {
      throw new CustomException(
        {
          message:
            "Ang barcode na ito ay hindi maaring ma RS (" +
            barcode +
            ") Paki chat ang operations <br>Example:<br> (Supplier Name) <br> Return or Disposal <br> Pakiusap paki sunod po ng format",
        },
        401
      );
    }
    return row[0];
  }
  /**
   * @param {string} vendorcode
   */
  async fetch_supplier_name(vendorcode) {
    let row = await Db.connection("srspos")
      .select("description")
      .from("vendor")
      .where("vendorcode", vendorcode);
    return row.length == 0 ? "NO VENDOR NAME" : row[0].description;
  }

  /**
   * return length of array
   * @param {string} vendorcode
   * @param {int} status
   */
  async fetch_items(vendorcode, status) {
    let row = await Db.select("supplier_code", "rs_id")
      .from("0_rms_items")
      .where("supplier_code", vendorcode)
      .andWhere("pending", status);
    return row;
  }
  /**
   * @param {int} barcode
   * @param {string} uom
   * @param {int} prod_id
   * @param {int} rs_id
   */
  async fetch_rs_qty_items(barcode, uom, rs_id) {
    let row = await Db.select("qty")
      .from("0_rms_items")
      .where("uom", uom)
      .andWhere("pending", 0)
      .andWhere("barcode", barcode)
      .andWhere("rs_id", rs_id);
    return row.length == 0 ? 0 : parseFloat(row[0].qty);
  }
  /**
   *
   * @param {int} productid
   * @param {int} p_barcode
   * @param {string} uom_
   * @param {int} p_qty
   * @param {float} cost
   * @param {string} vendorcode
   * @param {string} o_uom
   * @param {int} c_multip
   * @param {int} qtys
   * @param {string} user_id
   */
  async add_rms_header_and_items(
    productid,
    p_barcode,
    description,
    uom_,
    p_qty,
    cost,
    vendorcode,
    o_uom,
    c_multip,
    qtys,
    user_id,
    rs_id /*,
    p_branch*/
  ) {
    let rs_row = await this.fetch_type_rs(vendorcode, p_barcode);

    let data = {
      prod_id: productid,
      barcode: p_barcode,
      item_name: description,
      uom: uom_,
      qty: p_qty,
      price: cost,
      supplier_code: vendorcode,
      orig_uom: o_uom,
      orig_multiplier: qtys,
      custom_multiplier: c_multip,
      loginid: user_id,
      pending: 0,
      /*branch: p_branch,*/
    };

    let result = await Db.insert(data).into("0_rms_items");

    if (result) {
      let fetch_items = await this.fetch_items(vendorcode, 0);
      let vendor_name = await this.fetch_supplier_name(vendorcode);

      if (fetch_items.length == 1) {
        let data = {
          rs_date: moment().format(TO_DATE),
          supplier_code: vendorcode,
          rs_action: rs_row.ttype,
          created_by: user_id,
          supplier_name: vendor_name,
          /*branch: p_branch,*/
        };

        let result = await Db.insert(data).into("0_rms_header");
        let rs_id = result[0];
        // update rs_id in rs_items
        await Db.table("0_rms_items")
          .where("rs_id", 0)
          .andWhere("supplier_code", vendorcode)
          .update("rs_id", rs_id);
      } else {
        return await Db.table("0_rms_items")
          .where("rs_id", 0)
          .andWhere("supplier_code", vendorcode)
          .update("rs_id", rs_id);
      }
    }
  }

  /**
   *
   * @param {int} rs_id
   * @param {int} qty
   * @param {float} cost
   * @param {int} barcode
   * @param {string} uom
   */
  async update_rms_items(rs_id, qty, cost, barcode, uom) {
    let rqty = await this.fetch_rs_qty_items(barcode, uom, rs_id);

    let data = {
      qty: rqty + qty,
      price: parseFloat(cost),
    };

    // update qty in rs_items
    return await Db.table("0_rms_items")
      .where("uom", uom)
      .andWhere("pending", 0)
      .andWhere("barcode", barcode)
      .andWhere("rs_id", rs_id)
      .update(data);
  }

  async fetch_rms_items() {
    let row = await Db.select(
      "a.supplier_name",
      "a.rs_id",
      "a.supplier_code",
      "a.rs_action",
      "a.rs_date",
      "b.prod_id",
      "b.barcode",
      "b.item_name",
      "b.qty",
      "b.uom",
      "b.price",
      "b.id"
    )
      .joinRaw(
        "FROM 0_rms_header a INNER JOIN 0_rms_items b ON a.rs_id = b.rs_id"
      )
      .where("a.movement_no", 0)
      .andWhere("a.pending", 0)
      .andWhere("a.supplier_pending", 0)
      .whereNot("a.rs_action", 0)
      .orderBy("a.rs_id", "asc");
    return row;
  }

  async delete_rs(id, supplier_code, rs_id) {
    let row;
    let rmslength = await this.count_rms(supplier_code, rs_id);
    if (rmslength === 1) {
      row = await Db.table("0_rms_header")
        .where({
          supplier_code: supplier_code,
          rs_id: rs_id,
          pending: 0,
          movement_no: 0,
        })
        .delete();
    }
    row = await Db.table("0_rms_items")
      .where({ supplier_code: supplier_code, rs_id: rs_id, id: id, pending: 0 })
      .delete();
    return true;
  }

  async count_rms(supplier_code, rs_id) {
    let row = await Db.select("rs_id")
      .from("0_rms_items")
      .where({ supplier_code: supplier_code, rs_id: rs_id, pending: 0 });
    return row.length;
  }

  async getRmsHeader(vendor_list) {
    const vendor_code = [];

    for (const vendorCode of vendor_list) {
      let row = await Db.select("*")
        .from("0_rms_header")
        .where({
          supplier_code: vendorCode,
          supplier_pending: 0,
          pending: 0,
          approved: 0,
        })
        .orderBy("supplier_code", "desc");
      vendor_code.push(row[0]);
    }

    return vendor_code;
  }

  async mTotalQty(res_id) {
    let [row, field] = await Db.raw(
      `SELECT SUM(qty * (IF(custom_multiplier=0,orig_multiplier,custom_multiplier))) as totalQty FROM 0_rms_items WHERE rs_id IN (${res_id}) `
    );
    let [row2, field2] = await Db.raw(
      `SELECT SUM(ROUND(qty*price,4)) as netTotal FROM 0_rms_items  WHERE rs_id IN (${res_id})`
    );
    return [row[0].totalQty, row2[0].netTotal];
  }

  async msMovement(
    trx,
    rowTotal,
    rs_id,
    movementCode,
    branchName,
    currentUser
  ) {
    let vendorCode = "";
    let ToDescription = "";
    let ToAddress = "";
    let ContactPerson = "";
    let productHistoryDesc;
    let flowStockRom;
    let flowSa;
    let flowDmg;
    let begSa;
    let dmgIn;
    let saOut;
    let area;
    let movementNo;

    if (movementCode == "R2SSA") {
      movementNo = leftPad(await this.getCounter(trx, "R2SSA"), 10, 0);
      area = "BO ROOM";
      // console.log("movement_no: " + movementNo);
      vendorCode = await this.getRsVendorCode(rs_id);
      if (vendorCode != "") {
        let vendorRow = await this.getVendorDetails(vendorCode);
        productHistoryDesc = "RETURN TO SUPPLIER";
        flowStockRom = 0;
        flowSa = 0;
        flowDmg = 1;
        begSa = "NULL";
        dmgIn = "NULL";
        saOut = "NULL";

        ToDescription = vendorRow.description;
        ToAddress = vendorRow.address;
        ContactPerson = vendorRow.contactperson;
      }
    } else if (movementCode == "FDFB") {
      movementNo = leftPad(await this.getCounter(trx, "R2SSA"), 10, 0);
      area = "BO ROOM";
      productHistoryDesc = "For Disposal From BO";
      flowStockRom = 0;
      flowSa = 0;
      flowDmg = 1;
      begSa = null;
      dmgIn = null;
      saOut = null;
    }

    let fromDescription =
      `SAN ROQUE SUPERMARKET ${branchName.toUpperCase()}` + area;
    let productData = {
      movementNo,
      movementCode,
      ToDescription,
      ToAddress,
      ContactPerson,
      fromDescription,
      currentUser,
      rowTotal,
      vendorCode,
    };

    let productMovement = await this.productMovement(trx, "first", productData);

    // console.log("productMovement " + productMovement);

    if (!productMovement) return false;

    let movementId = await this.getMovementId(trx);
    // console.log("movementId 403 :" + movementId);
    if (!movementId) return false;

    let rowItems = await this.getRmsItemsList(rs_id);
    let cosTotal = 0;
    let begDamage, dmgOut;
    for (const row of rowItems) {
      let prodRow = await this.getProductRow(trx, row.prod_id);
      let posProdRow = await this.getPosProductRow(trx, row.barcode);
      let pack =
        row.custom_multiplier == 0
          ? row.orig_multiplier
          : row.custom_multiplier;
      let pcsQty = parseFloat(pack) * parseFloat(row.qty) + 0;

      if (movementCode == "R2SSA") {
        begSa = prodRow.SellingArea + 0;
        dmgOut = pcsQty + 0;
        begDamage = prodRow.Damaged + 0;
      } else {
        dmgOut = pcsQty + 0;
        begSa = prodRow.SellingArea + 0;
        begDamage = prodRow.Damaged + 0;
        row.price = prodRow.CostOfSales;
        cosTotal += row.price * pcsQty;
      }

      row.price += 0;

      let rowProdHistory = {
        productid: row.prod_id,
        barcode: row.barcode.toString(),
        transactionid: movementId,
        transactionno: movementNo.toString(),
        dateposted: moment().format("YYYY-MM-DD HH:mm:ss"),
        transactiondate: moment().format("YYYY-MM-DD HH:mm:ss"),
        description: productHistoryDesc.toString(),
        beginningsellingarea: begSa,
        beginningstockroom: 0,
        flowstockroom: flowStockRom,
        flowsellingarea: flowSa,
        sellingareain: null,
        sellingareaout: dmgOut,
        stockroomin: null,
        stockroomout: null,
        unitcost: row.price.toString(),
        damagedin: null,
        damagedout: null,
        layawayin: null,
        layawayout: null,
        onrequestin: null,
        onrequestout: null,
        postedby: currentUser,
        datedeleted: null,
        deletedby: null,
        movementcode: movementCode.toString(),
        terminalno: "",
        lotno: 0,
        expirationdate: null,
        SHAREWITHBRANCH: "0",
        CANCELLED: "0",
        CANCELLEDBY: "",
        BeginningDamaged: begDamage,
        FlowDamaged: flowDmg,
      };
      let prodHistory = await this.addProductHistory(trx, rowProdHistory);
      if (!prodHistory) return false;
      let movementLine = await this.addMovementLine(
        trx,
        movementId,
        row.prod_id,
        posProdRow.ProductCode,
        row.item_name,
        row.uom,
        row.price,
        row.qty,
        pack,
        row.barcode,
        movementCode
      );
      if (!movementLine) return false;

      let prodSql;

      if (movementCode === "R2SSA") {
        let extended = row.price * row.qty;
        let oldStock =
          prodRow.StockRoom + prodRow.SellingArea + prodRow.Damaged;
        let oldStockCos = oldStock * prodRow.CostOfSales;
        let newCos = prodRow.CostOfSales;

        if (oldStock - Math.abs(pcsQty) != 0) {
          let oldStockCosExt = oldStockCos - extended.toFixed(4);
          let newCo = oldStockCosExt / (oldStock - Math.abs(pcsQty));
          newCos = newCo.toFixed(4);
          prodSql = `UPDATE Products SET  SellingArea = SellingArea - ${pcsQty}, CostOfSales =  ${newCos}  WHERE ProductID = ${row.prod_id}`;
        } else {
          prodSql = `UPDATE Products SET SellingArea = SellingArea - ${pcsQty} WHERE ProductID = ${row.prod_id}`;
        }
      }

      if (movementCode == "FDFB") {
        await trx //MSSQL
          .table("Movements")
          .where("movementid", movementId)
          .andWhere("movementcode", movementCode)
          .update("nettotal", cosTotal);
      }

      await trx.raw(prodSql);
    }
    console.log("Movement no. " + movementNo);
    return movementNo;
  }

  async addProductHistory(trx, datas) {
    try {
      await trx //MSSQL
        .insert(datas)
        .into("producthistory");
      return true;
    } catch (Exception) {
      console.log(Exception);
      return false;
    }
  }

  async addMovementLine(
    trx,
    MovementID,
    ProductID,
    ProductCode,
    Description,
    UOM,
    unitcost,
    qty,
    pack,
    barcode,
    movementCode = ""
  ) {
    let extended = unitcost * qty;
    try {
      if (movementCode == "FDFB" || movementCode == "SA2BO")
        extended = unitcost * qty * pack;

      let datas = {
        movementid: MovementID,
        productid: ProductID,
        productcode: ProductCode.toString(),
        description: trim(Description),
        uom: UOM.toString(),
        unitcost: unitcost,
        qty: qty,
        extended: extended.toFixed(4),
        pack: pack,
        barcode: barcode.toString(),
      };

      await trx //MSSQL
        .insert(datas)
        .into("movementline");
      return true;
    } catch (Exception) {
      console.log(Exception);
      return false;
    }
  }

  async getProductRow(trx, productId) {
    try {
      let row = await trx //MSSQL
        .select("*")
        .from("Products")
        .where("productid", productId);
      return row[0];
    } catch (exception) {
      console.log(exception);
    }
  }

  async getPosProductRow(trx, barcode) {
    let row = await trx //MSSQL
      .select("*")
      .from("POS_Products")
      .where("barcode", barcode);
    return row[0];
  }

  async getRmsItemsList(rs_id) {
    let [row, field] =
      await Db.raw(`SELECT prod_id,barcode,item_name,uom,SUM(qty) as qty,orig_uom,orig_multiplier,
	    custom_multiplier,price,supplier_code FROM 0_rms_items WHERE rs_id IN (${rs_id}) GROUP BY prod_id,barcode,item_name,uom,orig_uom,orig_multiplier,
        custom_multiplier,price,supplier_code`);
    return row;
  }

  async getMovementId(trx) {
    try {
      let [rowMovement, field] = await trx //MSSQL
        .raw(`SELECT IDENT_CURRENT('[Movements]') AS [SCOPE_IDENTITY]`);
      let movementId = rowMovement.SCOPE_IDENTITY;
      if (movementId == 0) return false;
      return movementId;
    } catch (Exception) {
      console.log(Exception);
    }
  }

  async productMovement(trx, type, data) {
    if (type == "first") {
      try {
        let movementNo = data.movementNo,
          movementCode = data.movementCode,
          ToDescription = data.ToDescription,
          ToAddress = data.ToAddress,
          ContactPerson = data.ContactPerson,
          fromDescription = data.fromDescription,
          currentUser = data.currentUser,
          rowTotal = data.rowTotal,
          vendorCode = data.vendorCode;

        let row = {
          MovementNo: movementNo.toString(),
          MovementCode: movementCode.toString(),
          ReferenceNo: "",
          SourceInvoiceNo: "",
          SourceDRNo: "",
          ToDescription: trim(ToDescription.replace(/'/g, "")),
          ToAddress: trim(ToAddress),
          ContactPerson: trim(ContactPerson),
          FromDescription: fromDescription,
          FromAddress: "",
          DateCreated: moment().format("YYYY-MM-DD HH:mm:ss"),
          LastModifiedBy: "",
          LastDateModified: moment().format("YYYY-MM-DD HH:mm:ss"),
          Status: "2",
          PostedBy: currentUser,
          PostedDate: moment().format("YYYY-MM-DD HH:mm:ss"),
          Terms: 0,
          TransactionDate: moment().format("YYYY-MM-DD HH:mm:ss"),
          FieldStyleCode1: "",
          NetTotal: (rowTotal[1] + 0).toString(),
          StatusDescription: "POSTED",
          TotalQty: (rowTotal[1] + 0).toString(),
          CreatedBy: "",
          Remarks: "",
          CustomerCode: "",
          VendorCode: vendorCode.toString(),
          BranchCode: "",
          CashDiscount: "",
          FieldStyleCode: "",
          ToBranchCode: "",
          FrBranchCode: "",
          sourcemovementno: "",
          countered: 0,
          Transmitted: 0,
          WithPayable: 0,
          WithReceivable: 0,
          OtherExpenses: 0,
          ForexRate: 1,
          ForexCurrency: "PHP",
          SalesmanID: 0,
          RECEIVEDBY: "",
        };

        await trx.insert(row).into("Movements");

        return true;
      } catch (Exception) {
        console.log("LINE: 562 " + Exception.message);
      }
    }
  }

  async getVendorDetails(vendorCode) {
    let row = await Db.connection("srspos") //MSSQL
      .select("description", "address", "contactperson")
      .from("vendor")
      .where("vendorcode", vendorCode);
    return row[0];
  }

  async getRsVendorCode(rs_id) {
    let row = await Db.distinct("*")
      .from("0_rms_header")
      .whereIn("rs_id", [rs_id]);
    return row.length == 0 ? "" : row[0].supplier_code;
  }

  async getCounter(trx, code) {
    let row = await trx //MSSQL
      .select("counter")
      .from("counters")
      .where("transactiontypecode", code);
    let tranNo = parseInt(row[0].counter) + 1;
    if (row) {
      await trx //MSSQL
        .table("counters")
        .where("transactiontypecode", code)
        .update({ counter: tranNo });
      return tranNo;
    }
    return false;
  }

  async updateRms(
    trx,
    movement,
    rsAction,
    comment,
    currentUser,
    rowrsId,
    movementType
  ) {
    let movementField = movementType != "FDFB" ? `${movement}` : "";
    let data = {
      movement_type: movementType,
      movement_no: movementField,
      bo_processed_date: moment().format(TO_DATE),
      rs_action: rsAction,
      comment: trim(comment),
      processed: 1,
      processed_by: currentUser,
      pending: 1,
      expired_date: await this.Todays(90),
    };
    try {
      await trx.table("0_rms_header").whereIn("rs_id", [rowrsId]).update(data);

      await trx
        .table("0_rms_items")
        .whereIn("rs_id", [rowrsId])
        .update("pending", 1);
    } catch (Exception) {
      console.log(Exception);
    }

    return true;
  }

  async updateRmsPending(
    trx,
    rsAction,
    comment,
    currentUser,
    rowrsId,
    movementType
  ) {
    try {
      let datas = {
        rs_action: rsAction,
        processed: 1,
        pending: 1,
        bo_processed_date: moment().format(TO_DATE),
        processed_by: currentUser,
      };
      let row = await trx
        .table("0_rms_header")
        .whereIn("rs_id", [rowrsId])
        .andWhere("movement_type", "")
        .andWhere("movement_no", 0)
        .update(datas);
      if (row) {
        let res = await trx
          .table("0_rms_items")
          .whereIn("rs_id", [rowrsId])
          .update("pending", 1);

        if (res) {
          return true;
        }
      }

      return false;
    } catch (exception) {
      console.log(exception);
    }
  }

  async post_rs(rowrsId, rsAction, comment, branchName, currentUser) {
    const trx = await Db.beginTransaction();
    const trx2 = await Db.connection("srspos").beginTransaction();
    try {
      if (rsAction === 0) {
        let rmsHeader = await trx
          .table("0_rms_header")
          .whereIn("rs_id", [rowrsId.toString()])
          .update({ comment: trim(comment), rs_action: 0 });

        if (!rmsHeader)
          throw new CustomException(
            { message: `Something wrong in updating header rms.` },
            401
          );
      } else if (rsAction === 1) {
        let rowTotal = await this.mTotalQty(rowrsId);
        // console.log("totalQty: " + rowTotal);
        let codeMovement = "R2SSA";
        let movement = await this.msMovement(
          trx2,
          rowTotal,
          rowrsId,
          codeMovement,
          branchName,
          currentUser
        );
        // console.log("movement " + movement);
        if (!movement) {
          throw new CustomException(
            { message: `Something wrong in MS movement.` },
            401
          );
        }

        let id = leftPad(movement, 10, 0);
        // console.log("leftpad: " + id);
        let row = await this.movementCounter(trx2, id, codeMovement);
        if (!row) {
          throw new CustomException(
            { message: `Something wrong in MS movement.` },
            401
          );
        }
        // console.log("counters: " + row[0].counters);
        if (row[0].counters != 0) {
          let resRms = await this.updateRms(
            trx,
            movement,
            rsAction,
            comment,
            currentUser,
            rowrsId,
            codeMovement
          );
          // console.log("resRms: " + resRms);
          if (!resRms) {
            throw new CustomException(
              {
                message: `Something wrong in updating rms. Please refresh the app and try again.`,
              },
              401
            );
          }
        }
      } else if (rsAction === 2) {
        // console.log(rsAction + " 2")
        let codeMovement = "FDFB";
        let resRms = await this.updateRmsPending(
          trx,
          rsAction,
          comment,
          currentUser,
          rowrsId,
          codeMovement
        );
        if (!resRms) {
          throw new CustomException(
            {
              message: `Something wrong in updating rms. Please refresh the app and try again.`,
            },
            401
          );
        }
      }

      await trx.commit();
      await trx2.commit();
      return { status: true, message: "Successfully post" };
    } catch (Exception) {
      await trx.rollback();
      await trx2.rollback();
      return { status: true, message: Exception };
    }
  }

  async movementCounter(trx, id, codeMovement) {
    try {
      return await trx //MSSQL
        .from("Movements")
        .where("movementno", id.toString())
        .andWhere("MovementCode", codeMovement.toString())
        .count("movementno as counters");
    } catch (exception) {
      console.log(exception);
    }
  }

  async saveAuditTrail(tlogin_id, tdescription) {
    const trx = await Db.beginTransaction();
    try {
      let tip_address = await internalIp.v4();
      let tdate_start = moment().format("YYYY-MM-DD HH:mm:ss");

      let data = {
        tlogin_id: tlogin_id,
        tdescription: tdescription,
        tdate_start: tdate_start,
        tip_address: tip_address,
      };

      await Db.insert(data).into("0_audit_trail_return");
      await trx.commit();
      return true;
    } catch (Exception) {
      await trx.rollback();
      console.log(Exception);
      return false;
    }
  }

  async rsNoList(rs_id) {
    let [row, field] = await Db.raw(
      `SELECT rs_id, movement_no FROM 0_rms_header WHERE rs_id IN(?) AND pending = 1`,
      [rs_id]
    );
    return row.length == 0
      ? rs_id
      : row[0].movement_no == 0
      ? rs_id
      : row[0].movement_no;
  }

  async Todays(num) {
    return moment().add(num, "days").format("YYYY-MM-DD");
  }

  async print_rs(currentName, rsid, copy = 0, two_print = false) {
    try {
      console.log(currentName);
      let row = await this.getHeaderRms(rsid);
      let rsHeaderItems = await this.getDetailsRms(rsid);
      let supplierName = await this.getSupplierName(row.supplier_code);
      let date_ = new Date(row.rs_date);
      let headers = `SA to BO Slip \n` + rsid;
      let copyId = copy;
      let rsType =
        row.movement_type == ""
          ? row.rs_action == 1
            ? "R2SSA"
            : "FDFB"
          : row.movement_type;

      let movementType;
      let movementNo;
      let rsId;
      let status;

      if (rsType == "R2SSA") {
        movementType = rsType;
        movementNo = row.movement_no == 0 ? row.rs_id : row.movement_no;

        rsId = await this.getRsIds(movementType, movementNo);
        rsHeaderItems = await this.getMovementItems(movementType, movementNo);
        headers = `Return to Supplier Slip \nNo ` + movementNo;
        date_ = new Date(row.bo_processed_date);
      } else if (rsType == "FDFB") {
        movementType = rsType;
        movementNo = row.movement_no == 0 ? row.rs_id : row.movement_no;

        rsId = await this.getRsHeader(rsid);
        headers = `For Disposal from BO Slip \nNo ` + movementNo;

        let movementType_ = row.movement_type != "" ? true : row.movement_type;
        rsHeaderItems = await this.getMovementItems(
          movementType,
          rsId,
          movementType_
        );
        date_ = new Date(row.bo_processed_date);
      } else {
        return false;
      }

      status =
        row.trans_no == 0
          ? (status = "to be processed by accounting")
          : (status = "already processed by accounting");

      let rsDate = moment(date_).format("YYYY/MM/DD");
      let fileSystem = bluebird.promisifyAll(fs);

      let print = Helpers.appRoot() + "\\files";

      if (two_print) {
        let wsbat = fileSystem.createWriteStream(print + "\\print\\test.bat");
        wsbat.write('RUNDLL32 PRINTUI.DLL,PrintUIEntry /y /n "%EPSONTM%" \n');
        wsbat.write(
          "start /min notepad /P " + print + "\\print\\print_test.txt"
        );
        wsbat.end();
      }

      let wstream = fileSystem.createWriteStream(
        print + "\\print\\print_test.txt"
      );
      let product = `Product                                 QTY\n`;
      let totalQty;
      let qty = 0;
      let totalCost = [];
      let cost = 0;
      let coyname = [
        "*** Supplier's Copy ***",
        "*** Warehouse Copy ***",
        "*** Accounting Copy ***",
      ];
      let line = "";
      let branchName = this.branchName;

      wstream.write(`RETURNS and DISPOSAL ` + branchName.toUpperCase() + "\n");
      wstream.write(`${headers}\n`);
      wstream.write(`Supplier: ${supplierName.toUpperCase()}\n`);
      wstream.write(`Date: ${rsDate} \n`);
      wstream.write(`U.COST \n`);
      wstream.write(product);

      _.each(rsHeaderItems, function (rows) {
        let item = rows.item_name;
        let spacing = product.length - item.length;

        qty += rows.qty;
        totalQty = qty;
        cost += parseFloat(rows.qty) * parseFloat(rows.price);
        totalCost.push(cost);

        if (item.length >= 25) {
          item = item.replace(/ /g, "");
          item = item.slice(0, 25);
          spacing = product.length - item.length;
        }

        for (let i = 0; i < spacing - 3; i++) {
          item += " ";
        }

        item += rows.qty;
        wstream.write(`${item} \n`);
        wstream.write(accounting.formatMoney(rows.qty * rows.price, "") + `\n`);
        wstream.write(rows.uom + `\n`);
      });

      for (let x = 0; x < product.length - 1; x++) {
        line += `-`;
      }

      wstream.write(line + "\n");
      wstream.write("               TOTAL QTY: " + totalQty + `\n`);
      wstream.write(
        "           TOTAL AMOUNT: " +
          accounting.formatMoney(totalCost.slice(-1)[0], "") +
          "\n"
      );
      wstream.write(line + "\n");
      wstream.write("Prepared by:" + currentName.toUpperCase() + `\n`);
      wstream.write("Checked  by:" + currentName.toUpperCase() + `\n`);
      wstream.write("Received by: \n");
      wstream.write("___________________________________________\n");
      wstream.write(`            ${coyname[copyId]} \n`);
      wstream.end();

      let bat = spawn("cmd.exe", ["/c", print + "\\print\\test.bat"]);
      bat.stdout.on("data", (data) => {
        // console.log(data.toString())
      });
      bat.stderr.on("data", (data) => {
        // console.log(data.toString())
      });
      bat.on("exit", (code) => {
        // console.log(`Child exited with code ${code}`)
      });

      return true;
    } catch (Exception) {
      console.log(Exception);
    }
  }

  async getRsHeader(rs_id) {
    let row = await Db.select("*").from("0_rms_header").where("rs_id", rs_id);
    return row[0].rs_id;
  }

  async getRsIds(mtype, mno) {
    let rsId = [];
    let rows = await Db.select("rs_id")
      .from("0_rms_header")
      .where("movement_type", mtype)
      .andWhere("movement_no", mno);
    for (const row of rows) {
      rsId.push(row.rs_id);
    }

    return rsId.join(",");
  }

  async getMovementItems(mtype, mno, movementType = true) {
    let rows;
    if (movementType == true) {
      let [row, field] = await Db.raw(
        `SELECT prod_id,barcode,item_name,uom,SUM(qty) as qty,orig_uom,orig_multiplier,
                                custom_multiplier,price,a.supplier_code
                                FROM 0_rms_header a, 0_rms_items b
                                WHERE a.movement_type = ? 
                                AND ${
                                  mtype == "FDFB"
                                    ? "a.rs_id = ?"
                                    : "a.movement_no = ?"
                                }
                                AND a.rs_id = b.rs_id
                                GROUP BY prod_id,barcode,item_name,uom,orig_uom,orig_multiplier,
                                custom_multiplier,price,supplier_code
                                ORDER BY item_name`,
        [mtype, mno]
      );
      rows = row;
    } else {
      let [row, field] = await Db.raw(
        `SELECT prod_id,barcode,item_name,uom,SUM(qty) as qty,orig_uom,orig_multiplier,
                                custom_multiplier,price,a.supplier_code
                                FROM 0_rms_header a, 0_rms_items b
                                WHERE a.movement_type = ? 
                                AND ${
                                  mtype == "FDFB"
                                    ? "a.rs_id = ?"
                                    : "a.movement_no = ?"
                                }
                                AND a.rs_id = b.rs_id
                                GROUP BY prod_id,barcode,item_name,uom,orig_uom,orig_multiplier,
                                custom_multiplier,price,supplier_code
                                ORDER BY item_name`,
        ["", mno]
      );
      rows = row;
    }

    return rows.length == 0 ? [] : rows;
  }

  async getSupplierName(supp_code = "", brCode = "") {
    if (brCode == "") {
      let row = await Db.connection("srspos")
        .select("description")
        .from("vendor")
        .where("vendorcode", supp_code);
      return row.length == 0 ? "" : row[0].description;
    }
    let row = await Db.connection("srspos")
      .select("description")
      .from("vendor")
      .where("vendorcode", supp_code);
    return row.length == 0 ? "" : row[0].description;
  }

  async getAllSupplier() {
    let row = await Db.connection("srspos")
      .select("description", "vendorcode")
      .from("vendor");
    return row;
  }

  async getHeaderRms(rs_id) {
    let row = await Db.select("*").from("0_rms_header").where("rs_id", rs_id);
    return row.length == 0 ? [] : row[0];
  }

  async getDetailsRms(rs_id) {
    let row = await Db.select("*")
      .from("0_rms_items")
      .where("rs_id", rs_id)
      .orderBy("id", "desc");
    return row.length == 0 ? [] : row;
  }

  async getCountVendor(productID) {
    let result = await Db.connection("srspos")
      .select("VendorCode")
      .from("VENDOR_Products")
      .where("ProductID", productID);
    let vendorDetails = [];

    for (const row of result) {
      vendorDetails.push({
        supplierName: await this.getSupplierName(row.VendorCode),
        VendorCode: row.VendorCode,
      });
    }

    return vendorDetails;
  }

  async updateSupplier(supplierCode, rs_id) {
    let data = {
      supplier_code: supplierCode,
    };

    let result = await Db.table("0_rms_header")
      .where("rs_id", rs_id)
      .update(data);
    if (result) {
      let result = await Db.table("0_rms_items")
        .where("rs_id", rs_id)
        .update(data);
      return result ? true : false;
    }

    return false;
  }

  /**  type transfer
   *@param {string} vendorcode
   */
  async fetch_transfer_type(vendorcode) {
    let row = await Db.select("ttype")
      .from("0_return_type")
      .where("tsuplier_code", vendorcode);
    console.log(row.length);
    return row.length == 0 ? false : row[0].ttype;
  }

  // DATACOLLECTOR
  async print_rs_dc(currentName, rsid, copy = 0, two_print = false) {
    try {
      console.log(currentName);
      let row = await this.getHeaderRms(rsid);
      let rsHeaderItems = await this.getDetailsRms(rsid);
      let supplierName = await this.getSupplierName(row.supplier_code);
      let date_ = new Date(row.rs_date);
      let headers = `SA to BO Slip \n` + rsid;
      let copyId = copy;
      let rsType =
        row.movement_type == ""
          ? row.rs_action == 1
            ? "R2SSA"
            : "FDFB"
          : row.movement_type;

      var obj = {};
      let movementType;
      let movementNo;
      let rsId;
      let status;

      if (rsType == "R2SSA") {
        movementType = rsType;
        movementNo = row.movement_no == 0 ? row.rs_id : row.movement_no;

        rsId = await this.getRsIds(movementType, movementNo);
        rsHeaderItems = await this.getMovementItems(movementType, movementNo);
        headers = `Return to Supplier Slip \nNo ` + movementNo;
        date_ = new Date(row.bo_processed_date);
      } else if (rsType == "FDFB") {
        movementType = rsType;
        movementNo = row.movement_no == 0 ? row.rs_id : row.movement_no;

        rsId = await this.getRsHeader(rsid);
        headers = `For Disposal from BO Slip \nNo ` + movementNo;

        let movementType_ = row.movement_type != "" ? true : row.movement_type;
        rsHeaderItems = await this.getMovementItems(
          movementType,
          rsId,
          movementType_
        );
        date_ = new Date(row.bo_processed_date);
      } else {
        return false;
      }

      status =
        row.trans_no == 0
          ? (status = "to be processed by accounting")
          : (status = "already processed by accounting");

      let rsDate = moment(date_).format("YYYY/MM/DD");
      let fileSystem = bluebird.promisifyAll(fs);

      let print = Helpers.appRoot() + "\\files";

      if (two_print) {
        let wsbat = fileSystem.createWriteStream(print + "\\print\\test.bat");
        wsbat.write('RUNDLL32 PRINTUI.DLL,PrintUIEntry /y /n "%EPSONTM%" \n');
        wsbat.write(
          "start /min notepad /P " + print + "\\print\\print_test.txt"
        );
        wsbat.end();
      }

      let wstream = fileSystem.createWriteStream(
        print + "\\print\\print_test.txt"
      );
      let product = `Product                              QTY\n`;
      let totalQty;
      let qty = 0;
      let totalCost = [];
      let cost = 0;
      let coyname = [
        "*** Supplier's Copy ***",
        "*** Warehouse Copy ***",
        "*** Accounting Copy ***",
      ];
      let line = "";
      let branchName = this.branchName;
      let details = {};
      var new_arr = [];

      wstream.write(`RETURNS and DISPOSAL ` + branchName.toUpperCase() + "\n");
      wstream.write(`${headers}\n`);
      wstream.write(`Supplier: ${supplierName.toUpperCase()}\n`);
      wstream.write(`Date: ${rsDate} \n`);
      wstream.write(`U.COST \n`);
      wstream.write(product);

      obj["branchname"] = branchName.toUpperCase();
      obj["headers"] = headers;
      obj["supplier"] = supplierName.toUpperCase();
      obj["date"] = rsDate;

      _.each(rsHeaderItems, function (rows) {
        let item = rows.item_name;
        let spacing = product.length - item.length;

        qty += rows.qty;
        totalQty = qty;
        cost += parseFloat(rows.qty) * parseFloat(rows.price);
        totalCost.push(cost);

        if (item.length >= 25) {
          item = item.replace(/ /g, "");
          item = item.slice(0, 25);
          spacing = product.length - item.length;
        }

        for (let i = 0; i < spacing - 3; i++) {
          item += " ";
        }

        item += rows.qty;
        wstream.write(`${item} \n`);
        wstream.write(accounting.formatMoney(rows.qty * rows.price, "") + `\n`);
        wstream.write(rows.uom + `\n`);

        details["product"] = rows.item_name;
        details["qty"] = rows.qty;
        details["cost"] = accounting.formatMoney(rows.qty * rows.price, "");
        details["uom"] = rows.uom;

        new_arr.push(rows);
      });

      obj["details"] = new_arr;

      for (let x = 0; x < 15 - 1; x++) {
        line += `-`;
      }

      wstream.write(line + "\n");
      wstream.write("               TOTAL QTY: " + totalQty + `\n`);
      wstream.write(
        "           TOTAL AMOUNT: " +
          accounting.formatMoney(totalCost.slice(-1)[0], "") +
          "\n"
      );
      wstream.write(line + "\n");
      wstream.write("Prepared by:" + currentName.toUpperCase() + `\n`);
      wstream.write("Checked  by:" + currentName.toUpperCase() + `\n`);
      wstream.write("Received by: \n");
      wstream.write("________________________________________\n");
      wstream.write(`         ${coyname[copyId]} \n`);
      wstream.end();

      obj["totalQty"] = totalQty;
      obj["totalAmt"] = accounting.formatMoney(totalCost.slice(-1)[0], "");
      obj["currentName"] = currentName.toUpperCase();
      obj["coy"] = copyId;

      // let bat = spawn('cmd.exe', ['/c', print+'\\print\\test.bat'])
      // bat.stdout.on('data', (data) => {
      // 	// console.log(data.toString())
      // })
      // bat.stderr.on('data', (data) => {
      // 	// console.log(data.toString())
      // })
      // bat.on('exit', (code) => {
      // 	// console.log(`Child exited with code ${code}`)
      // })

      return obj;
    } catch (Exception) {
      console.log(Exception);
    }
  }
  // ./DATACOLLECTOR

  async manualSellingArea() {
    const trx = await Db.connection("srspos").beginTransaction();

    let movementCode = "R2SSA";
    let rs_id = 9990211008;

    let rowItems = await this.getRmsItemsList(rs_id);

    for (const row of rowItems) {
      let prodRow = await this.getProductRow(trx, row.prod_id);
      let posProdRow = await this.getPosProductRow(trx, row.barcode);
      let pack =
        row.custom_multiplier == 0
          ? row.orig_multiplier
          : row.custom_multiplier;
      let pcsQty = parseFloat(pack) * parseFloat(row.qty) + 0;

      let prodSql;

      if (movementCode === "R2SSA") {
        let extended = row.price * row.qty;
        let oldStock =
          prodRow.StockRoom + prodRow.SellingArea + prodRow.Damaged;
        let oldStockCos = oldStock * prodRow.CostOfSales;
        let newCos = prodRow.CostOfSales;

        if (oldStock - Math.abs(pcsQty) != 0) {
          let oldStockCosExt = oldStockCos - extended.toFixed(4);
          let newCo = oldStockCosExt / (oldStock - Math.abs(pcsQty));
          newCos = newCo.toFixed(4);
          prodSql = `UPDATE Products SET  SellingArea = SellingArea - ${pcsQty}, CostOfSales =  ${newCos}  WHERE ProductID = ${row.prod_id}`;
        } else {
          prodSql = `UPDATE Products SET SellingArea = SellingArea - ${pcsQty} WHERE ProductID = ${row.prod_id}`;
        }
      }
      console.log(prodSql);
    }

    await trx.rollback();
  }

  // MAX AMOUNT 2000
  async fetch_rs_total_amount(rs_id, vendor_code) {
    let [row] = await Db.raw(
      `SELECT SUM(price*qty) as price FROM 0_rms_items WHERE supplier_code = '${vendor_code}' AND pending = 0 AND rs_id = ${rs_id}`
    );
    return row.length == 0 ? 0 : parseFloat(row[0].price);
  }
  // ./ MAX AMOUNT 2000
}

module.exports = new RsMod();
