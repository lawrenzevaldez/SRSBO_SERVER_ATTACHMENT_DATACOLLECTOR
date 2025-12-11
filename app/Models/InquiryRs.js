"use strict";

/** @type {typeof import('@adonisjs/lucid/src/Lucid/Model')} */
const Model = use("Model");
const Db = use("Database");
const Env = use("Env");
const internalIp = use("internal-ip");
const leftPad = use("left-pad");
const trim = use("trim");
const Helpers = use("Helpers");
const br_code = Env.get("BRANCH_CODE", "");
const _ = use("lodash");
const CustomException = use("App/Exceptions/CustomException");
const fs = require("fs");

const moment = use("moment");
const TO_DATE = Env.get("TO_DATE");

class InquiryRs extends Model {
  constructor() {
    super();
    this.Today = moment().format("YYYY-MM-DD");
    // this.TodayTime = moment().format('YYYY-MM-DD HH:mm:ss')
    this.TodayTime = moment().format("YYYY/MM/DD");
  }

  async fetch_list_supplier() {
    let row = await Db.connection("srspos")
      .select("vendorcode", "description")
      .from("vendor")
      .whereNotNull("description");
    return row;
  }

  async getListRequest(
    dateFrom,
    dateTo,
    supplierCode,
    status,
    rsId,
    rs_action,
    brCode
  ) {
    let continue_ = "",
      where = [];
    try {
      if (dateFrom != "" && dateTo != "") {
        let from_ = new Date(dateFrom);
        let to_ = new Date(dateTo);

        continue_ += `rs_date >= ? AND rs_date <= ?`;
        where.push(from_);
        where.push(to_);
      }

      if (dateFrom == "" && dateTo == "") {
        continue_ += `rs_date >= ? AND rs_date <= ?`;
        let less_day = moment().subtract(1, "days").format("YYYY-MM-DD");
        where.push(less_day);
        where.push(this.Today);
      }

      if (
        supplierCode != undefined &&
        typeof supplierCode != "undefined" &&
        supplierCode != "undefined" &&
        supplierCode != ""
      ) {
        continue_ += ` AND supplier_code = ?`;
        where.push(supplierCode);
      }

      if (rsId != "") {
        continue_ = ` (rs_id = ? OR movement_no = ?)`;
        where = [rsId, rsId];
      }

      if (status != 3 && status != undefined) {
        continue_ += ` AND approved = ?`;
        where.push(status);
      }

      let [row, field] = await Db.raw(
        `SELECT * FROM 0_rms_header WHERE processed != 0 AND rs_action = ${rs_action} AND ${continue_} ORDER BY rs_id`,
        where
      );

      return row.length == 0 ? [] : row;
    } catch (Exception) {
      console.log(Exception);
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

  async getExtended(rs_id, branchCode) {
    let items = await Db.select("qty", "price")
      .from("0_rms_items")
      .where("rs_id", rs_id);

    if (!items || items.length === 0) {
      return 0;
    }

    let total = 0;
    for (const row of items) {
      total += parseFloat(row.price) * parseFloat(row.qty);
    }
    return total.toFixed(3);
  }

  async updateRmsHeader(
    deliveryName,
    plateNumber,
    rs_id,
    /*file,*/ currentUser,
    rs_action
  ) {
    const trx = await Db.beginTransaction();
    try {
      if (rs_action == 2) {
        let datas = {
          movement_type: "FDFB",
          bo_processed_date: moment().format(TO_DATE),
          processed: "1",
          processed_by: "2",
          pending: "1",
        };

        let res = await trx
          .table("0_rms_header")
          .whereIn("rs_id", [rs_id])
          .update(datas);

        if (res > 0) {
          let res = await trx
            .table("0_rms_items")
            .whereIn("rs_id", [rs_id])
            .update("pending", 1);
        }

        await trx.commit();
        return true;
      } else {
        let row = await Db.select("trs_id")
          .from("0_pickup_item")
          .where("trs_id", rs_id);

        if (row.length > 0) {
          return true;
        }

        try {
          // let fileName = `2~${rs_id}.${file.extname}`
          let datas = {
            trs_id: rs_id,
            tname: deliveryName,
            tplate_no: plateNumber,
            // timage: fileName,
          };
          let row = await trx.insert(datas).into("0_pickup_item");
          if (row) {
            let row = await trx
              .table("0_rms_header")
              .andWhere("rs_action", rs_action)
              .whereIn("rs_id", [rs_id])
              .update({ picked_up: 1 }, { expired_date: "" });
            if (row) {
              await trx.commit();
              return true;
            }
          }
        } catch (Exception) {
          console.log(Exception);
        }
        // if(row) {
        //     let row = await trx.table('0_rms_header')
        //                     .andWhere('rs_action', rs_action)
        //                     .whereIn('rs_id', [rs_id])
        //                     .update({picked_up: 1}, {expired_date: 1})
        //     if(row) {
        //         await file.move(Helpers.publicPath('images/uploads'), {
        //             name: fileName,
        //             overwrite: true
        //         })

        //         if(file.moved()) {
        //             await trx.commit()
        //             return true
        //         } else {
        //             return file.error()
        //         }
        //     }
        // }
      }
    } catch (Exception) {
      await trx.rollback();
      console.log(Exception);
    }
  }

  async updateRmsHeaderPicture(
    deliveryName,
    plateNumber,
    rs_id,
    pictureInvoice,
    pictureRSSlip,
    pictureDriversID,
    pictureActualRS,
    user_id,
    rs_action,
    pictureInvoice_url,
    pictureRSSlip_url,
    pictureDriversID_url,
    pictureActualRS_url
  ) {
    const trx = await Db.beginTransaction();
    try {
      if (rs_action == 2) {
        let datas = {
          movement_type: "FDFB",
          bo_processed_date: moment().format(TO_DATE),
          processed: "1",
          processed_by: "2",
          pending: "1",
        };

        let res = await trx
          .table("0_rms_header")
          .whereIn("rs_id", [rs_id])
          .update(datas);

        if (res) {
          let res = await trx
            .table("0_rms_items")
            .whereIn("rs_id", [rs_id])
            .update("pending", 1);
        }
      } else {
        let row = await Db.select("trs_id")
          .from("0_pickup_item")
          .where("trs_id", rs_id);
        if (row.length > 0) {
          return true;
        } else {
          try {
            // let fileName = `2~${rs_id}.${file.extname}`
            let fpictureInvoice = `${user_id}~pictureInvoice.${pictureInvoice.extname}`;
            let fpictureRSSlip = `${user_id}~pictureRSSlip.${pictureRSSlip.extname}`;
            let fpictureDriversID = `${user_id}~pictureDriversID.${pictureDriversID.extname}`;
            let fpictureActualRS = `${user_id}~pictureActualRS.${pictureActualRS.extname}`;

            let datas = {
              trs_id: rs_id,
              tname: deliveryName,
              tplate_no: plateNumber,
              tpictureInvoice: fpictureInvoice,
              tpictureRSSlip: fpictureRSSlip,
              tpictureDriversID: fpictureDriversID,
              tpictureActualRS: fpictureActualRS,
              tpictureInvoice_url: pictureInvoice_url,
              tpictureRSSlip_url: pictureRSSlip_url,
              tpictureDriversID_url: pictureDriversID_url,
              tpictureActualRS_url: pictureActualRS_url,
            };
            let row = await trx.insert(datas).into("0_pickup_item");
            // console.log(row)
            // if(row)
            // {
            //     let row = await trx.table('0_rms_header')
            //                 .andWhere('rs_action', rs_action)
            //                 .whereIn('rs_id', [rs_id])
            //                 .update({picked_up: 1}, {expired_date: ''})
            //     if(row) {
            //         await trx.commit()
            //         return true
            //     }
            // }

            if (row) {
              let row = await trx
                .table("0_rms_header")
                .andWhere("rs_action", rs_action)
                .whereIn("rs_id", [rs_id])
                .update({ picked_up: 1 }, { expired_date: 1 });
              if (row) {
                if (!fs.existsSync(Helpers.publicPath(`images/${rs_id}`))) {
                  fs.mkdirSync(Helpers.publicPath(`images/${rs_id}`));
                }
                await pictureInvoice.move(
                  Helpers.publicPath(`images/${rs_id}`),
                  {
                    name: fpictureInvoice,
                    overwrite: true,
                  }
                );

                if (!pictureInvoice.moved()) {
                  console.log("INVOICE MOVE ERROR:", pictureInvoice.error());
                  return pictureInvoice.error();
                }

                await pictureRSSlip.move(
                  Helpers.publicPath(`images/${rs_id}`),
                  {
                    name: fpictureRSSlip,
                    overwrite: true,
                  }
                );

                if (!pictureRSSlip.moved()) {
                  console.log("RS SLIP MOVE ERROR:", pictureInvoice.error());
                  return pictureRSSlip.error();
                }

                await pictureDriversID.move(
                  Helpers.publicPath(`images/${rs_id}`),
                  {
                    name: fpictureDriversID,
                    overwrite: true,
                  }
                );

                if (!pictureDriversID.moved()) {
                  console.log("DRIVERS ID MOVE ERROR:", pictureInvoice.error());
                  return pictureDriversID.error();
                }

                await pictureActualRS.move(
                  Helpers.publicPath(`images/${rs_id}`),
                  {
                    name: fpictureActualRS,
                    overwrite: true,
                  }
                );

                if (!pictureActualRS.moved()) {
                  console.log("ACTUAL RS MOVE ERROR:", pictureInvoice.error());
                  return pictureActualRS.error();
                }
              }
            }
            await trx.commit();
            return true;
          } catch (Exception) {
            console.log(Exception);
            await trx.rollback();
            return false;
          }
        }
      }
    } catch (Exception) {
      await trx.rollback();
      console.log(Exception);
    }
  }

  async updateRmsHeaderBulk(rs_id, user_id, rs_action) {
    const trx = await Db.beginTransaction();
    try {
      if (rs_action == 2) {
        let datas = {
          movement_type: "FDFB",
          bo_processed_date: moment().format(TO_DATE),
          processed: "1",
          processed_by: "2",
          pending: "1",
        };

        let res = await trx
          .table("0_rms_header")
          .whereIn("rs_id", [rs_id])
          .update(datas);

        if (res) {
          await trx
            .table("0_rms_items")
            .whereIn("rs_id", [rs_id])
            .update("pending", 1);
        }
      } else {
        let row = await trx
          .select("trs_id")
          .from("0_pickup_item")
          .where("trs_id", rs_id);
        if (row.length > 0) {
          return true;
        } else {
          let sel_temp = await trx
            .select("*")
            .from("0_pickup_item_temp")
            .where("rs_id", rs_id)
            .where("rs_action", rs_action)
            .andWhere("status", 0);
          // console.log(sel_temp)
          if (sel_temp.length > 0) {
            let data = {
              trs_id: sel_temp[0].rs_id,
              tname: sel_temp[0].delivery_name,
              tplate_no: sel_temp[0].plate_number,
              tpictureActualRS: sel_temp[0].picture_actualrs,
              tpictureActualRS_url: sel_temp[0].picture_actualrs_url,
              tpictureDriversID: sel_temp[0].picture_driversid,
              tpictureDriversID_url: sel_temp[0].picture_driversid_url,
              tpictureInvoice: sel_temp[0].picture_invoice,
              tpictureInvoice_url: sel_temp[0].picture_invoice_url,
              tpictureRSSlip: sel_temp[0].picture_rsslip,
              tpictureRSSlip_url: sel_temp[0].picture_rsslip_url,
            };

            let transfer_row = await trx.insert(data).into("0_pickup_item");
            // console.log(transfer_row);
            if (transfer_row) {
              await trx
                .table("0_rms_header")
                .andWhere("rs_action", rs_action)
                .whereIn("rs_id", [rs_id])
                .update({ picked_up: 1 }, { expired_date: "" });

              await trx
                .table("0_pickup_item_temp")
                .where("rs_id", rs_id)
                .andWhere("rs_action", rs_action)
                .update({ status: 1 });
            }
          }
        }
      }

      await trx.commit();
      return true;
    } catch (e) {
      console.log(e);
      await trx.rollback();
      return false;
    }
  }

  async getTImage(rs_id) {
    let row = await Db.select(
      "tpictureActualRS",
      "tpictureDriversID",
      "tpictureInvoice",
      "tpictureRSSlip",
      "tpictureActualRS_url",
      "tpictureDriversID_url",
      "tpictureInvoice_url",
      "tpictureRSSlip_url",
      "tname",
      "tplate_no"
    )
      .from("0_pickup_item")
      .where("trs_id", rs_id);
    return row.length == 0 ? 0 : row[0];
  }

  async getHeaderRms(rs_id, brCode = "") {
    if (brCode == "") {
      let row = await Db.select("*").from("0_rms_header").where("rs_id", rs_id);
      return row.length == 0 ? [] : row[0];
    }

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

  async getMovementItems(mtype, mno, brCode = "") {
    let rows;
    if (brCode == "") {
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

  async getRsHeader(rs_id) {
    let row = await Db.select("*").from("0_rms_header").where("rs_id", rs_id);
    return row[0].rs_id;
  }

  async createTempData(rs_id, rs_action) {
    try {
      let rsChecker = await Db.select("*")
        .from("0_pickup_item_temp")
        .where("rs_id", rs_id);

      if (rsChecker.length > 0) {
        return false;
      }

      let data = {
        rs_id: rs_id,
        rs_action: rs_action,
      };
      let row = await Db.insert(data).into("0_pickup_item_temp");

      return row ? true : false;
    } catch (e) {
      console.log(e);
    }
  }

  async uploadTempFileRsSlip(url, rs_id, rs_action, file, file_desc, user_id) {
    const trx = await Db.beginTransaction();
    try {
      // let rowChecker = await Db.select('*')
      //             .from('0_pickup_item_temp')
      //             .whereNotNull('picture_rsslip')
      //             .andWhere('rs_id', rs_id)

      // if(rowChecker.length > 0) {
      //     await trx.rollback()
      //     return 'duplicate'
      // }

      let fFile = `${user_id}~${file_desc}.${file.extname}`;

      let datas = {
        picture_rsslip: fFile,
        picture_rsslip_url: url,
      };

      let row = await trx
        .table("0_pickup_item_temp")
        .where("rs_id", rs_id)
        .update(datas);

      if (row) {
        if (!fs.existsSync(Helpers.publicPath(`images/${rs_id}`))) {
          fs.mkdirSync(Helpers.publicPath(`images/${rs_id}`));
        }
        await file.move(Helpers.publicPath(`images/${rs_id}`), {
          name: fFile,
          overwrite: true,
        });

        if (!file.moved()) {
          return file.error();
        }
      }

      await trx.commit();
      return true;
    } catch (Exception) {
      await trx.rollback();
      console.log(Exception);
    }
  }

  async uploadTempFileActualRS(
    url,
    rs_id,
    rs_action,
    file,
    file_desc,
    user_id
  ) {
    const trx = await Db.beginTransaction();
    try {
      // let rowChecker = await Db.select('*')
      //             .from('0_pickup_item_temp')
      //             .whereNotNull('picture_actualrs')
      //             .andWhere('rs_id', rs_id)

      // if(rowChecker.length > 0) {
      //     await trx.rollback()
      //     return 'duplicate'
      // }

      let fFile = `${user_id}~${file_desc}.${file.extname}`;

      let datas = {
        picture_actualrs: fFile,
        picture_actualrs_url: url,
      };

      let row = await trx
        .table("0_pickup_item_temp")
        .where("rs_id", rs_id)
        .update(datas);

      if (row) {
        if (!fs.existsSync(Helpers.publicPath(`images/${rs_id}`))) {
          fs.mkdirSync(Helpers.publicPath(`images/${rs_id}`));
        }
        await file.move(Helpers.publicPath(`images/${rs_id}`), {
          name: fFile,
          overwrite: true,
        });

        if (!file.moved()) {
          return file.error();
        }
      }

      await trx.commit();
      return true;
    } catch (Exception) {
      await trx.rollback();
      console.log(Exception);
    }
  }

  async uploadTempFileInvoice(url, rs_id, rs_action, file, file_desc, user_id) {
    const trx = await Db.beginTransaction();
    try {
      // let rowChecker = await Db.select('*')
      //             .from('0_pickup_item_temp')
      //             .whereNotNull('picture_invoice')
      //             .andWhere('rs_id', rs_id)

      // if(rowChecker.length > 0) {
      //     await trx.rollback()
      //     return 'duplicate'
      // }

      let fFile = `${user_id}~${file_desc}.${file.extname}`;

      let datas = {
        picture_invoice: fFile,
        picture_invoice_url: url,
      };

      let row = await trx
        .table("0_pickup_item_temp")
        .where("rs_id", rs_id)
        .update(datas);

      if (row) {
        if (!fs.existsSync(Helpers.publicPath(`images/${rs_id}`))) {
          fs.mkdirSync(Helpers.publicPath(`images/${rs_id}`));
        }
        await file.move(Helpers.publicPath(`images/${rs_id}`), {
          name: fFile,
          overwrite: true,
        });

        if (!file.moved()) {
          return file.error();
        }
      }

      await trx.commit();
      return true;
    } catch (Exception) {
      await trx.rollback();
      console.log(Exception);
    }
  }

  async uploadTempFileDriversID(
    url,
    rs_id,
    rs_action,
    file,
    file_desc,
    user_id
  ) {
    const trx = await Db.beginTransaction();
    try {
      // let rowChecker = await Db.select('*')
      //             .from('0_pickup_item_temp')
      //             .whereNotNull('picture_driversid')
      //             .andWhere('rs_id', rs_id)

      // if(rowChecker.length > 0) {
      //     await trx.rollback()
      //     return 'duplicate'
      // }

      let fFile = `${user_id}~${file_desc}.${file.extname}`;

      let datas = {
        picture_driversid: fFile,
        picture_driversid_url: url,
      };

      let row = await trx
        .table("0_pickup_item_temp")
        .where("rs_id", rs_id)
        .update(datas);

      if (row == 1) {
        if (!fs.existsSync(Helpers.publicPath(`images/${rs_id}`))) {
          fs.mkdirSync(Helpers.publicPath(`images/${rs_id}`));
        }
        await file.move(Helpers.publicPath(`images/${rs_id}`), {
          name: fFile,
          overwrite: true,
        });

        if (!file.moved()) {
          return file.error();
        }
      }

      await trx.commit();
      return true;
    } catch (Exception) {
      await trx.rollback();
      console.log(Exception);
    }
  }

  async copyTempFileDriversID(
    url,
    rs_id,
    rs_action,
    rsid0,
    description,
    user_id
  ) {
    const trx = await Db.beginTransaction();
    try {
      let fFile = `${user_id}~${description}.jpg`;

      let datas = {
        picture_driversid: fFile,
        picture_driversid_url: url,
      };

      let row = await trx
        .table("0_pickup_item_temp")
        .where("rs_id", rs_id)
        .update(datas);

      if (row == 1) {
        if (!fs.existsSync(Helpers.publicPath(`images/${rs_id}`))) {
          fs.mkdirSync(Helpers.publicPath(`images/${rs_id}`));
        }

        fs.copyFile(
          Helpers.publicPath(`images/${rsid0}/${fFile}`),
          Helpers.publicPath(`images/${rs_id}/${fFile}`),
          (error) => {
            if (error) {
              console.log(error);
            }
          }
        );
      }

      await trx.commit();
      return true;
    } catch (e) {
      console.log(e);
      await trx.rollback();
      return false;
    }
  }

  async copyTempFileInvoice(
    url,
    rs_id,
    rs_action,
    rsid0,
    description,
    user_id
  ) {
    const trx = await Db.beginTransaction();
    try {
      let fFile = `${user_id}~${description}.jpg`;

      let datas = {
        picture_invoice: fFile,
        picture_invoice_url: url,
      };

      let row = await trx
        .table("0_pickup_item_temp")
        .where("rs_id", rs_id)
        .update(datas);

      if (row == 1) {
        if (!fs.existsSync(Helpers.publicPath(`images/${rs_id}`))) {
          fs.mkdirSync(Helpers.publicPath(`images/${rs_id}`));
        }

        fs.copyFile(
          Helpers.publicPath(`images/${rsid0}/${fFile}`),
          Helpers.publicPath(`images/${rs_id}/${fFile}`),
          (error) => {
            if (error) {
              console.log(error);
            }
          }
        );
      }

      await trx.commit();
      return true;
    } catch (e) {
      console.log(e);
      await trx.rollback();
      return false;
    }
  }

  async saveDeliveryName(rs_id, value) {
    const trx = await Db.beginTransaction();
    try {
      let data = {
        delivery_name: value,
      };

      await trx.table("0_pickup_item_temp").where("rs_id", rs_id).update(data);

      await trx.commit();
      return true;
    } catch (e) {
      console.log(e);
      await trx.rollback();
      return false;
    }
  }

  async savePlateNumber(rs_id, value) {
    const trx = await Db.beginTransaction();
    try {
      let data = {
        plate_number: value,
      };

      await trx.table("0_pickup_item_temp").where("rs_id", rs_id).update(data);

      await trx.commit();
      return true;
    } catch (e) {
      console.log(e);
      await trx.rollback();
      return false;
    }
  }
}

module.exports = new InquiryRs();
