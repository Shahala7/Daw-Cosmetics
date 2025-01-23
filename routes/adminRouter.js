const express = require("express");
const Router = express.Router();

const adminController = require("../controllers/adminController");
const customerController = require("../controllers/customerController");
const categoryController = require("../controllers/categoryController");
const productController = require("../controllers/productController");
const brandController = require("../controllers/brandController");
const orderContoller = require("../controllers/orderContoller")

// Ensure the correct path to your multer config

// Add product route

const { isAdmin } = require("../Authentication/auth");
// Admin Actions
Router.get("/login", adminController.getLoginPage);
Router.post("/login", adminController.verifyLogin);
Router.get("/logout", isAdmin, adminController.getLogout);
Router.get("/", isAdmin, adminController.adminDashboard);


// Category Management
Router.get("/category", isAdmin, categoryController.getCategoryInfo);
Router.get("/addcategory", isAdmin, categoryController.getaddCategory);
Router.post("/addCategory", isAdmin, categoryController.addCategory);
Router.get("/allCategory", isAdmin, categoryController.getAllCategories);
Router.get("/listCategory", isAdmin, categoryController.listCategory);
Router.get("/unListCategory", isAdmin, categoryController.unListCategory)
Router.get("/addCategoryOffer", isAdmin, categoryController.addCategoryOffer);
Router.get("/removeCategoryOffer", isAdmin, categoryController.removeCategoryOffer);

// Customer Management
Router.get("/users", isAdmin, customerController.getCustomersInfo);
Router.get("/blockCustomer", isAdmin, customerController.getCustomerBlocked);
Router.get("/unblockCustomer", isAdmin, customerController.getCustomerUnblocked);


const multer = require("multer")
const storage = require("../config/multer")
const upload = multer({ storage: storage })
Router.use("/public/uploads", express.static("/public/uploads"))

Router.post('/addProducts', isAdmin,upload.array("images", 5),productController.addProducts);
Router.get("/addProducts", isAdmin, productController.getProductAddPage)
Router.get("/products", isAdmin, productController.getAllProducts);
Router.get("/editProduct", isAdmin, productController.getEditProduct)
Router.post("/editProduct/:id",isAdmin, upload.array("images", 5),productController.editProduct);
Router.post("/deleteImage", isAdmin, productController.deleteSingleImage);
Router.get("/blockProduct", isAdmin, productController.getBlockProduct);
Router.get("/unBlockProduct", isAdmin, productController.getUnblockProduct);
Router.post("/addProductOffer", isAdmin, productController.addProductOffer);
Router.post("/removeProductOffer", isAdmin, productController.removeProductOffer);
Router.post('/get-subcategories',isAdmin, productController.subCat);

Router.get("/orderList", isAdmin, orderContoller.getOrderListPageAdmin)
Router.get("/orderDetailsAdmin", isAdmin, orderContoller.getOrderDetailsPageAdmin)
Router.get("/changeStatus", isAdmin, orderContoller.changeOrderStatus)


Router.get("/coupon", isAdmin, adminController.getCouponPageAdmin)
Router.get("/createCoupon", isAdmin, adminController.getaddCoupon);
Router.post("/createCoupon", isAdmin, adminController.createCoupon)


Router.get("/salesReport", isAdmin, adminController.getSalesReportPage)
Router.get("/salesToday", isAdmin, adminController.salesToday)
Router.get("/salesWeekly", isAdmin, adminController.salesWeekly)
Router.get("/salesMonthly", isAdmin, adminController.salesMonthly)
Router.get("/salesYearly", isAdmin, adminController.salesYearly)
Router.get("/dateWiseFilter", isAdmin, adminController.dateWiseFilter)
Router.get("/dateRange", isAdmin, adminController.dateRangeFilter)
Router.post("/generatePdf", isAdmin, adminController.generatePdf)
Router.post("/downloadExcel", isAdmin, adminController.downloadExcel)



//RetturnRequest
Router.get("/manageReturnRequests", isAdmin, adminController.returnRequest)
Router.put('/returnRequests/approve/:returnId', isAdmin, adminController.approveReturnRequest);
Router.put('/returnRequests/decline/:returnId', isAdmin, adminController.declineReturnRequest);


// Brand Management
Router.get("/brands", isAdmin, brandController.getBrandPage)
Router.post("/addBrand", isAdmin, upload.single('image'), brandController.addBrand)
Router.get("/allBrands", isAdmin, brandController.getAllBrands)
Router.get("/blockBrand", isAdmin, brandController.blockBrand)
Router.get("/unBlockBrand", isAdmin, brandController.unBlockBrand)

module.exports = Router;
