"use strict";

/*
|--------------------------------------------------------------------------
| Routes
|--------------------------------------------------------------------------
|
| Http routes are entry points to your web application. You can create
| routes for different URLs and bind Controller actions to them.
|
| A complete guide on routing is available here.
| http://adonisjs.com/docs/4.0/routing
|
*/

/** @type {typeof import('@adonisjs/framework/src/Route/Manager')} */
const Route = use("Route");
const Env = use("Env");

Route.get("/", () => {
  return { greeting: "Hello world in JSON" };
});

Route.group(() => {
  Route.post("/purchaser/receive_po/auth", "AuthController.auth");
  Route.get("/purchaser/receive_po/logout", "AuthController.logout");

  Route.get("/purchaser/rs/fetch_list_uom", "RsController.fetch_list_uom");
  Route.get(
    "/purchaser/rs/fetch_list_branch",
    "RsController.fetch_list_branch"
  );
  Route.get("/purchaser/rs/fetch_rms_items", "RsController.fetch_rms_items");
  Route.post(
    "/purchaser/rs/fetch_barcode",
    "RsController.fetch_barcode"
  ).middleware(["checkUser"]);
  Route.post("/purchaser/rs/delete_rs", "RsController.delete_rs");
  Route.post("/purchaser/rs/create_rs", "RsController.post_rs").middleware([
    "checkUser",
  ]);
  // DATACOLLECTOR
  Route.post(
    "/purchaser/rs/create_rs_dc",
    "RsController.post_rs_dc"
  ).middleware(["checkUser"]);
  // ./DATACOLLECTOR
  Route.post(
    "/purchaser/rs/updateSupplier",
    "RsController.updateSupplier"
  ).middleware(["checkUser"]);

  Route.get(
    "/purchaser/inquiry_rs/fetch_list_supplier",
    "InquiryRsController.fetch_list_supplier"
  );
  Route.get(
    "/purchaser/inquiry_rs/getListRequest",
    "InquiryRsController.getListRequest"
  );
  Route.post(
    "/purchaser/inquiry_rs/pickUpItem",
    "InquiryRsController.pickUpItem"
  ).middleware(["checkUser"]);
  Route.post(
    "/purchaser/inquiry_rs/pickUpItemPicture",
    "InquiryRsController.pickUpItemPicture"
  ).middleware(["checkUser"]);
  Route.post(
    "/purchaser/inquiry_rs/pickUpItemBulk",
    "InquiryRsController.pickUpItemBulk"
  ).middleware(["checkUser"]);
  Route.post(
    "/purchaser/inquiry_rs/upload_temp_file_actualrs",
    "InquiryRsController.uploadTempFileActualRS"
  ).middleware(["checkUser"]); //middleware
  Route.post(
    "/purchaser/inquiry_rs/upload_temp_file_rsslip",
    "InquiryRsController.uploadTempFileRSSlip"
  ).middleware(["checkUser"]); //middleware
  Route.post(
    "/purchaser/inquiry_rs/upload_temp_file_invoice",
    "InquiryRsController.uploadTempFileInvoice"
  ).middleware(["checkUser"]); //middleware
  Route.post(
    "/purchaser/inquiry_rs/upload_temp_file_driversid",
    "InquiryRsController.uploadTempFileDriversID"
  ).middleware(["checkUser"]); //middleware
  Route.post(
    "/purchaser/inquiry_rs/create_temp_data",
    "InquiryRsController.create_temp_data"
  ).middleware(["checkUser"]); //middleware
  Route.post(
    "/purchaser/inquiry_rs/save_temp_data",
    "InquiryRsController.save_temp_data"
  ).middleware(["checkUser"]); //middleware
  Route.get("/purchaser/inquiry_rs/viewItem", "InquiryRsController.getItem");
  Route.get(
    "/purchaser/inquiry_rs/print_rs",
    "InquiryRsController.getPrintRs"
  ).middleware(["checkUser"]);
  //DATACOLLECTOR
  Route.get(
    "/purchaser/inquiry_rs/print_rs_dc",
    "InquiryRsController.getPrintRs_dc"
  ).middleware(["checkUser"]);
  // ./DATACOLLECTOR
  Route.get(
    "/purchaser/inquiry_rs/getDetails",
    "InquiryRsController.getDetails"
  );

  // DEV USE
  Route.get("/dev/manualSellingArea", "RsController.manualSellingArea");
  // ./DEV USE

  Route.get(
    "/system/website/fetch_page_body",
    "SystemController.fetch_page_body"
  );
}).prefix("api");

Route.any("*", function ({ view, request }) {
  const url =
    request.protocol() + "://" + request.hostname() + ":" + Env.get("PORT", "");

  if (request.hostname() === "srsnetwork.dyndns.org") {
    return view.render("index", { APP_URL: url });
  } else if (request.hostname() === "192.168.5.16") {
    return view.render("index", { APP_URL: url });
  } else {
    return view.render("index", { APP_URL: Env.get("APP_URL", "") });
  }
  // console.log( Env.get('APP_URL', ''))
});
