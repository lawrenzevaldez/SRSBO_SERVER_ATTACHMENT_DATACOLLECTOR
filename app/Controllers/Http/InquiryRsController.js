"use strict";

const InquiryRs = use("App/Models/InquiryRs");
const RsMod = use("App/Models/Rs");
const DbModel = use("App/Models/DbModel");
const PosProductMod = use("App/Models/PosProduct");
const CustomException = use("App/Exceptions/CustomException");
const Env = use("Env");
const Helpers = use("Helpers");
const leftPad = use("left-pad");
const _ = use("lodash");

const moment = require("moment");
const TO_DATE = Env.get("TO_DATE");

class InquiryRsController {
  constructor() {
    this.branchCode = Env.get("BRANCH_CODE", "");
    this.branchName = Env.get("BRANCH_NAME", "");
  }

  async fetch_list_supplier({ request, response }) {
    let supplier = await InquiryRs.fetch_list_supplier();

    response.status(200).send({ supplier });
  }

  async getListRequest({ request, response }) {
    let {
      dateFrom,
      dateTo,
      supplierCode,
      status,
      rsId,
      rs_action,
      branchCode,
      user_id,
    } = request.only([
      "dateFrom",
      "dateTo",
      "supplierCode",
      "status",
      "rsId",
      "rs_action",
      "branchCode",
      "user_id",
    ]);
    let brCode = branchCode === "" ? this.branchCode : branchCode;
    let rows = await InquiryRs.getListRequest(
      dateFrom,
      dateTo,
      supplierCode,
      status,
      rsId,
      rs_action,
      brCode
    );
    let listRequest = [];

    if (!rows) {
      let message =
        "Something wrong in fetching list items or you didn't have a connection for this branch. Please contact I.T Programmer or try to refresh the page and try again.";
      await InquiryRs.saveAuditTrail(user_id, message);
      throw new CustomException({ message: message }, 401);
    }

    let count = 0;
    let rowSupplier = await DbModel.getAllSupplier(brCode);
    let rowUser = await DbModel.getNameAll(brCode);

    for (const row of rows) {
      let supplier = _.find(rowSupplier, { vendorcode: row.supplier_code });
      if (supplier == undefined) {
        supplier = "NO NAME";
      } else {
        supplier = supplier.description;
      }

      let created_by = _.find(rowUser, { loginid: row.created_by.toString() });
      if (created_by == undefined) {
        created_by = "NO NAME";
      } else {
        created_by = created_by.name;
      }

      let processed_by = _.find(rowUser, {
        loginid: row.processed_by.toString(),
      });
      if (processed_by == undefined) {
        processed_by = "NO NAME";
      } else {
        processed_by = processed_by.name;
      }

      let approved_by_aria_user = _.find(rowUser, {
        loginid: row.approved_by_aria_user.toString(),
      });
      if (approved_by_aria_user == undefined) {
        approved_by_aria_user = "NO NAME";
      } else {
        approved_by_aria_user = approved_by_aria_user.name;
      }

      listRequest.push({
        rs_id: row.rs_id,
        rs_date: row.rs_date,
        movement_no: row.movement_no,
        movement_type: row.movement_type,
        bo_processed_date: row.bo_processed_date,
        supplier_code: supplier,
        rs_action: row.rs_action,
        reprint: "SA to BO",
        picked_up: row.picked_up,
        created_by: created_by,
        processed_by: processed_by,
        extended: await InquiryRs.getExtended(row.rs_id, brCode),
        approved_by_aria_user: approved_by_aria_user,
        approved: row.approved,
      });
    }

    let description = `VISIT PAGE INQUIRY ${
      rs_action == 1 ? "RETURN ITEM" : "BO ITEM"
    } `;
    await InquiryRs.saveAuditTrail(user_id, description);
    response.status(200).send({ listRequest });
  }

  async pickUpItem({ request, response }) {
    let { rs_id, rs_action, deliveryName, plateNumber, user_id } = request.only(
      ["rs_id", "rs_action", "deliveryName", "plateNumber", "user_id"]
    );
    // let file = request.file('file')

    let result = await InquiryRs.updateRmsHeader(
      deliveryName,
      plateNumber,
      rs_id,
      /*file,*/ user_id,
      rs_action
    );

    if (result) {
      await InquiryRs.saveAuditTrail(
        user_id,
        `Item picked up process by ${user_id}`
      );
      response.status(200).send({
        status:
          "Successfully picked up an item. You will be redirected after 3 seconds!",
      });
    } else {
      await InquiryRs.saveAuditTrail(
        user_id,
        "An error has occured in server. Please try again!"
      );
      response.status(401).send({
        status: '"An error has occured in server. Please try again!"',
      });
    }
  }

  async pickUpItemPicture({ request, response }) {
    let {
      rs_id,
      rs_action,
      deliveryName,
      plateNumber,
      user_id,
      pictureInvoice_url,
      pictureRSSlip_url,
      pictureDriversID_url,
      pictureActualRS_url,
    } = request.only([
      "rs_id",
      "rs_action",
      "deliveryName",
      "plateNumber",
      "user_id",
      "pictureInvoice_url",
      "pictureRSSlip_url",
      "pictureDriversID_url",
      "pictureActualRS_url",
    ]);

    let pictureInvoice = request.file("pictureInvoice");
    let pictureRSSlip = request.file("pictureRSSlip");
    let pictureDriversID = request.file("pictureDriversID");
    let pictureActualRS = request.file("pictureActualRS");

    let result = await InquiryRs.updateRmsHeaderPicture(
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
    );

    if (result) {
      await InquiryRs.saveAuditTrail(
        user_id,
        `RS ID# ${rs_id} picked up process by ${user_id}`
      );
      response.status(200).send({
        status:
          "Successfully picked up an item. You will be redirected after 3 seconds!",
      });
    } else {
      await InquiryRs.saveAuditTrail(
        user_id,
        "An error has occured in server. Please try again!"
      );
      response.status(401).send({
        status: '"An error has occured in server. Please try again!"',
      });
    }
  }

  async pickUpItemBulk({ request, response }) {
    try {
      // let { rs_action, deliveryName, plateNumber, user_id, pictureRSSlip, pictureActualRS } = request.only(['rs_action', 'deliveryName', 'plateNumber', 'user_id', 'pictureRSSlip', 'pictureActualRS'])
      // let pictureInvoice = request.file('pictureInvoice')
      // let pictureRSSlip = request.file('pictureRSSlip')
      // let pictureDriversID = request.file('pictureDriversID')
      // let pictureActualRS = request.file('pictureActualRS')
      // console.log(JSON.parse(pictureActualRS))
      let { rs_id, user_id, rs_action } = request.only([
        "rs_id",
        "user_id",
        "rs_action",
      ]);
      let result = [];

      for (const row of rs_id) {
        let res = await InquiryRs.updateRmsHeaderBulk(row, user_id, rs_action);
        if (res) {
          result.push(row);
          await InquiryRs.saveAuditTrail(
            user_id,
            `RS ID# ${row} picked up process by ${user_id}`
          );
        } else {
          result.push(`An error occured while updating RS ID#${row}`);
          await InquiryRs.saveAuditTrail(
            user_id,
            `An error occured while updating RS ID#${row}`
          );
        }
      }

      response.send({ result });

      // return false

      // let result = await InquiryRs.updateRmsHeader(deliveryName, plateNumber, rs_id, pictureInvoice, pictureRSSlip, pictureDriversID, pictureActualRS, user_id, rs_action, pictureInvoice_url, pictureRSSlip_url, pictureDriversID_url, pictureActualRS_url)

      // if(result) {
      //     await InquiryRs.saveAuditTrail(user_id, `Item picked up process by ${user_id}`)
      //     response.status(200).send({ status: 'Successfully picked up an item. You will be redirected after 3 seconds!' })
      // }
      // else {
      //     await InquiryRs.saveAuditTrail(user_id, "An error has occured in server. Please try again!")
      //     response.status(401).send({ status: '"An error has occured in server. Please try again!"' })
      // }
    } catch (e) {
      console.log(e);
    }
  }

  async uploadTempFileRSSlip({ request, response }) {
    let { url, rs_id, rs_action, description, user_id } = request.only([
      "url",
      "rs_id",
      "rs_action",
      "description",
      "user_id",
    ]);
    let file = request.file("file");

    let result = await InquiryRs.uploadTempFileRsSlip(
      url,
      rs_id,
      rs_action,
      file,
      description,
      user_id
    );

    if (result) {
      response.status(200).send({
        status: `Successfully added RS Slip attachment for RS#${rs_id}`,
      });
    } else {
      await InquiryRs.saveAuditTrail(
        user_id,
        "An error has occured in server. Please try again!"
      );
      response
        .status(401)
        .send({ status: "An error has occured in server. Please try again!" });
    }
  }

  async uploadTempFileActualRS({ request, response }) {
    let { url, rs_id, rs_action, description, user_id } = request.only([
      "url",
      "rs_id",
      "rs_action",
      "description",
      "user_id",
    ]);
    let file = request.file("file");

    let result = await InquiryRs.uploadTempFileActualRS(
      url,
      rs_id,
      rs_action,
      file,
      description,
      user_id
    );

    if (result) {
      response.status(200).send({
        status: `Successfully added Actual RS attachment for RS#${rs_id}`,
      });
    } else {
      await InquiryRs.saveAuditTrail(
        user_id,
        "An error has occured in server. Please try again!"
      );
      response
        .status(401)
        .send({ status: "An error has occured in server. Please try again!" });
    }
  }

  async uploadTempFileDriversID({ request, response }) {
    let { url, rs_id, rs_action, description, user_id } = request.only([
      "url",
      "rs_id",
      "rs_action",
      "description",
      "user_id",
    ]);
    let file = request.file("file");
    let rsid = JSON.parse(rs_id);
    let rsid0 = rsid[0];
    let status = [];

    for (let i = 0; i < rsid.length; i++) {
      let result;

      if (i == 0) {
        result = await InquiryRs.uploadTempFileDriversID(
          url,
          rsid[i],
          rs_action,
          file,
          description,
          user_id
        );
      } else {
        result = await InquiryRs.copyTempFileDriversID(
          url,
          rsid[i],
          rs_action,
          rsid0,
          description,
          user_id
        );
      }

      if (result) {
        status.push(
          `Successfully added Drivers ID attachment for RS#${rsid[i]}`
        );
      } else {
        await InquiryRs.saveAuditTrail(
          user_id,
          "An error has occured in server. Please try again!"
        );
        status.push("An error has occured in server. Please try again!");
      }
    }

    response.status(200).send({ status: status });
  }

  async uploadTempFileInvoice({ request, response }) {
    let { url, rs_id, rs_action, description, user_id } = request.only([
      "url",
      "rs_id",
      "rs_action",
      "description",
      "user_id",
    ]);
    let file = request.file("file");
    let rsid = JSON.parse(rs_id);
    let rsid0 = rsid[0];
    let status = [];

    for (let i = 0; i < rsid.length; i++) {
      let result;

      if (i == 0) {
        result = await InquiryRs.uploadTempFileInvoice(
          url,
          rsid[i],
          rs_action,
          file,
          description,
          user_id
        );
      } else {
        result = await InquiryRs.copyTempFileInvoice(
          url,
          rsid[i],
          rs_action,
          rsid0,
          description,
          user_id
        );
      }

      if (result) {
        status.push(`Successfully added Invoice attachment for RS#${rsid[i]}`);
      } else {
        await InquiryRs.saveAuditTrail(
          user_id,
          "An error has occured in server. Please try again!"
        );
        status.push("An error has occured in server. Please try again!");
      }
    }

    response.status(200).send({ status: status });
  }

  async create_temp_data({ request, response }) {
    let { rs_id, rs_action } = request.only(["rs_id", "rs_action"]);
    for (const row of rs_id) {
      let result = await InquiryRs.createTempData(row, rs_action);

      if (!result) {
        return false;
      }
    }
  }

  async save_temp_data({ request, respose }) {
    let { rs_id, value, description } = request.only([
      "rs_id",
      "value",
      "description",
    ]);

    for (const row of rs_id) {
      let result;

      if (description == "deliveryName") {
        result = await InquiryRs.saveDeliveryName(row, value);
      } else {
        result = await InquiryRs.savePlateNumber(row, value);
      }

      if (!result) {
        return false;
      }
    }

    return true;
  }

  async getItem({ request, response }) {
    let { rs_id } = request.only(["rs_id"]);
    let getTImage = await InquiryRs.getTImage(rs_id);
    if (getTImage != 0) {
      let tpictureInvoice = getTImage.tpictureInvoice;
      let tpictureRSSlip = getTImage.tpictureRSSlip;
      let tpictureDriversID = getTImage.tpictureDriversID;
      let tpictureActualRS = getTImage.tpictureActualRS;
      response.status(200).send({
        tpictureInvoice: getTImage.tpictureInvoice,
        tpictureRSSlip: getTImage.tpictureRSSlip,
        tpictureDriversID: getTImage.tpictureDriversID,
        tpictureActualRS: getTImage.tpictureActualRS,
        tpictureInvoice_url: `${rs_id}/${tpictureInvoice}`,
        tpictureRSSlip_url: `${rs_id}/${tpictureRSSlip}`,
        tpictureDriversID_url: `${rs_id}/${tpictureDriversID}`,
        tpictureActualRS_url: `${rs_id}/${tpictureActualRS}`,
        deliveryName: getTImage.tname,
        plateNumber: getTImage.tplate_no,
      });
    } else {
      response
        .status(200)
        .send({ picture: "", deliveryName: "", plateNumber: "" });
    }
  }

  async getDetails({ request, response }) {
    let status = "",
      rsActionName = "",
      rsMovementNo = "",
      copyId = "";

    let { rs_id, type, user_id } = request.only(["rs_id", "type", "user_id"]);

    let row = await InquiryRs.getHeaderRms(rs_id, "");
    let rsHeaderItems = await InquiryRs.getDetailsRms(rs_id, "");
    let supplierName = await InquiryRs.getSupplierName(row.supplier_code, "");

    let date_ = new Date(row.rs_date);
    let headers = `SA to BO Slip #` + rs_id;
    let mtype, mNo, rsId;

    if (type === "view_rs") {
      if (row.processed == 0) {
        status = "Pending";
      } else {
        if (row.rs_action == 1) {
          status = `Returned to Supplier`;
          rsActionName = `Return to Supplier Slip #:`;
          rsMovementNo = `${row.movement_no}`;
        } else {
          status = `Disposed`;
          rsActionName = `For Disposal from BO Slip #:`;
          rsMovementNo = `${row.movement_no}`;
        }
      }
    } else if (type === "movement_rs") {
      let rsType = row.movement_type;

      if (rsType == "R2SSA") {
        mtype = rsType;
        mNo = row.movement_no;
        rsId = await InquiryRs.getRsIds(mtype, mNo);

        rsHeaderItems = await InquiryRs.getMovementItems(mtype, mNo);
        headers = `Return to Supplier Slip \nNo ` + mNo;
        date_ = new Date(row.bo_processed_date);
        copyId = 3;
      } else {
        mtype = rsType;
        mNo = row.movement_no;
        rsId = await InquiryRs.getRsHeader(rs_id);

        headers = `For Disposal From BO Slip \nNo ` + mNo;
        rsHeaderItems = await InquiryRs.getDetailsRms(rs_id);
        date_ = new Date(row.bo_processed_date);
      }

      if (row.trans_no == 0) {
        status = "to be processed by accounting";
      } else {
        status = "already processed by accounting";
      }

      rsActionName = `SA to BO #: `;
      rsMovementNo = rsId;
    }

    let rsDate = moment(date_).format("YYYY/MM/DD");

    const data = {
      title: "VIEW RS",
      rsheader: rsHeaderItems,
      supplierName: supplierName,
      headers: headers,
      status: status,
      rsActionName: rsActionName,
      rsMovementNo: rsMovementNo,
      rsDate: rsDate,
    };

    await InquiryRs.saveAuditTrail(
      user_id,
      `VIEW DETAILS OF RS ITEMS DETAILS RS # ${rs_id}`
    );

    return data;
  }

  async getPrintRs({ request, response }) {
    let { rs_id, type, user_id, user_fullname } = request.only([
      "rs_id",
      "type",
      "user_id",
      "user_fullname",
    ]);
    let resultPrint = await RsMod.print_rs(user_fullname, rs_id, type);

    if (!resultPrint) {
      let message = `There's an error in printing RS # ${rs_id} or it doesn't have a movement #`;
      await InquiryRs.saveAuditTrail(user_id, message);
      throw new CustomException({ message: message }, 401);
    }

    await InquiryRs.saveAuditTrail(user_id, `Print this RS # ${rs_id}`);

    response.status(200).send({});
  }

  async getPrintRs_dc({ request, response }) {
    try {
      let { rs_id, type, user_id, user_fullname } = request.only([
        "rs_id",
        "type",
        "user_id",
        "user_fullname",
      ]);
      let resultPrint = await RsMod.print_rs_dc(user_fullname, rs_id, type);

      if (!resultPrint) {
        let message = `There's an error in printing RS # ${rs_id} or it doesn't have a movement #`;
        await InquiryRs.saveAuditTrail(user_id, message);
        throw new CustomException({ message: message }, 401);
      }

      await InquiryRs.saveAuditTrail(user_id, `Print this RS # ${rs_id}`);

      response.status(200).send({ forprint: resultPrint });
    } catch (e) {
      console.log(e);
    }
  }
}

module.exports = InquiryRsController;
