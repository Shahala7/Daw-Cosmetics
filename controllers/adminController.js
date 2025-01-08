const User = require("../models/userSchema");
const Coupon = require("../models/couponSchema")
const Category = require("../models/categorySchema")
const Product = require("../models/productSchema")
const Order = require("../models/orderSchema")
const moment = require('moment');
const ExcelJS = require("exceljs")
const bcrypt = require("bcryptjs");
// const Order = require("../models/orderSchema");

const PDFDocument = require('pdfkit')

const getLoginPage = async (req, res) => {
    try {
        res.render("admin-login")
    } catch (error) {
        console.log(error.message);
    }
}

const verifyLogin = async (req, res) => {
    try {
        const { email, password } = req.body
        console.log(email)

        const findAdmin = await User.findOne({ email, isAdmin: "1" })
        // console.log("admin data : ", findAdmin);

        if (findAdmin) {
            const passwordMatch = await bcrypt.compare(password, findAdmin.password)
            if (passwordMatch) {
                req.session.admin = true
                console.log("Admin Logged In");
                res.redirect("/admin")
            } else {
                console.log("Password is not correct");
                res.redirect("/admin/login")
            }
        } else {
            console.log("He's not an admin");
        }
    } catch (error) {
        console.log(error.message);
    }
}

const getCouponPageAdmin = async (req, res) => {     
    try {            
        let page = 1
        if (req.query.page) {
            page = req.query.page
        }
        const limit = 3
        
        // If createdAt doesn't exist, try sorting by _id which typically 
        // increases chronologically in MongoDB
        const findCoupons = await Coupon.find({})
            .sort({ _id: -1 })  // Alternative sorting method
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec()
        
        const count = await Coupon.find({}).countDocuments()
        
        res.render("coupon", {
            coupons: findCoupons,
            totalPages: Math.ceil(count / limit),
            currentPage: page 
        })
    } catch (error) {
        console.log(error.message);
        res.status(500).render('error', { message: 'An error occurred while fetching coupons' });
    } 
}

const createCoupon = async (req, res) => {
    try {

        const data = {
            couponName: req.body.couponName,
            startDate: new Date(req.body.startDate + 'T00:00:00'),
            endDate: new Date(req.body.endDate + 'T00:00:00'),
            offerPrice: parseInt(req.body.offerPrice),
            minimumPrice: parseInt(req.body.minimumPrice)
        };

        const newCoupon = new Coupon({
            name: data.couponName,
            createdOn: data.startDate,
            expireOn: data.endDate,
            offerPrice: data.offerPrice,
            minimumPrice: data.minimumPrice
        })

        await newCoupon.save()
            .then(data => console.log(data))

        res.redirect("/admin/coupon")

        console.log(data);

    } catch (error) {
        console.log(error.message);
    }
}

const getaddCoupon = async (req, res) => {
    try {
        res.render("coupon-add")
    } catch (error) {
        console.log(error.message);
    }
}



const getLogout = async (req, res) => {
    try {
        req.session.admin = null
        res.redirect("/admin/login")
    } catch (error) {
        console.log(error.message);
    }
}
const getSalesReportPage = async (req, res) => {
    try {
        // const orders = await Order.find({ status: "Delivered" }).sort({ createdOn: -1 })
        // console.log(orders);

        // res.render("salesReport", { data: currentOrder, totalPages, currentPage })

        // console.log(req.query.day);
        let filterBy = req.query.day
        if (filterBy) {
            res.redirect(`/admin/${req.query.day}`)
        } else {
            res.redirect(`/admin/salesMonthly`)
        }
    } catch (error) {
        console.log(error.message);
    }
}

const salesToday = async (req, res) => {
    try {
        let today = new Date()
        const startOfTheDay = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate(),
            0,
            0,
            0,
            0
        )

        const endOfTheDay = new Date(
            today.getFullYear(),
            today.getMonth(),
            today.getDate(),
            23,
            59,
            59,
            999
        )

        const orders = await Order.aggregate([
            {
                $match: {
                    createdOn: {
                        $gte: startOfTheDay,
                        $lt: endOfTheDay
                    },
                    status: "Delivered"
                }
            }
        ]).sort({ createdOn: -1 })


        let itemsPerPage = 5
        let currentPage = parseInt(req.query.page) || 1
        let startIndex = (currentPage - 1) * itemsPerPage
        let endIndex = startIndex + itemsPerPage
        let totalPages = Math.ceil(orders.length / 3)
        const currentOrder = orders.slice(startIndex, endIndex)

        console.log(currentOrder, "currOrder");

        res.render("salesReport", { data: currentOrder, totalPages, currentPage, salesToday: true })

    } catch (error) {
        console.log(error.message);
    }
}


const salesWeekly = async (req, res) => {
    try {
        let currentDate = new Date()
        const startOfTheWeek = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            currentDate.getDate() - currentDate.getDay()
        )

        const endOfTheWeek = new Date(
            currentDate.getFullYear(),
            currentDate.getMonth(),
            currentDate.getDate() + (6 - currentDate.getDay()),
            23,
            59,
            59,
            999
        )

        const orders = await Order.aggregate([
            {
                $match: {
                    createdOn: {
                        $gte: startOfTheWeek,
                        $lt: endOfTheWeek
                    },
                    status: "Delivered"
                }
            }
        ]).sort({ createdOn: -1 })

        let itemsPerPage = 5
        let currentPage = parseInt(req.query.page) || 1
        let startIndex = (currentPage - 1) * itemsPerPage
        let endIndex = startIndex + itemsPerPage
        let totalPages = Math.ceil(orders.length / 3)
        const currentOrder = orders.slice(startIndex, endIndex)

        res.render("salesReport", { data: currentOrder, totalPages, currentPage, salesWeekly: true })

    } catch (error) {
        console.log(error.message);
    }
}


const salesMonthly = async (req, res) => {
    try {
        let currentMonth = new Date().getMonth() + 1
        const startOfTheMonth = new Date(
            new Date().getFullYear(),
            currentMonth - 1, 
            1, 0, 0, 0, 0
        )
        const endOfTheMonth = new Date(
            new Date().getFullYear(),
            currentMonth,
            0, 23, 59, 59, 999
        )
        const orders = await Order.aggregate([
            {
                $match: {
                    createdOn: {
                        $gte: startOfTheMonth,
                        $lt: endOfTheMonth
                    },
                    status: "Delivered"
                }
            }
        ]).sort({ createdOn: -1 })  
        // .then(data=>console.log(data))
        console.log("ethi");
        console.log(orders);

        let itemsPerPage = 5
        let currentPage = parseInt(req.query.page) || 1
        let startIndex = (currentPage - 1) * itemsPerPage
        let endIndex = startIndex + itemsPerPage
        let totalPages = Math.ceil(orders.length / 3)
        const currentOrder = orders.slice(startIndex, endIndex)

        res.render("salesReport", { data: currentOrder, totalPages, currentPage, salesMonthly: true })


    } catch (error) {
        console.log(error.message);
    }
}


const salesYearly = async (req, res) => {
    try {
        const currentYear = new Date().getFullYear()
        const startofYear = new Date(currentYear, 0, 1, 0, 0, 0, 0)
        const endofYear = new Date(currentYear, 11, 31, 23, 59, 59, 999)

        const orders = await Order.aggregate([
            {
                $match: {
                    createdOn: {
                        $gte: startofYear,
                        $lt: endofYear
                    },
                    status: "Delivered"
                }
            }
        ])


        let itemsPerPage = 5
        let currentPage = parseInt(req.query.page) || 1
        let startIndex = (currentPage - 1) * itemsPerPage
        let endIndex = startIndex + itemsPerPage
        let totalPages = Math.ceil(orders.length / 3)
        const currentOrder = orders.slice(startIndex, endIndex)

        res.render("salesReport", { data: currentOrder, totalPages, currentPage, salesYearly: true })

    } catch (error) {
        console.log(error.message);
    }
}
const generatePdf = async (req, res) => {
    try {
        const doc = new PDFDocument();
        const filename = 'sales-report.pdf';
        const orders = req.body;
        // console.log(orders);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        doc.pipe(res);
        doc.fontSize(12);
        doc.text('Sales Report', { align: 'center', fontSize: 16 });
        const margin = 5;
        doc
            .moveTo(margin, margin)
            .lineTo(600 - margin, margin)
            .lineTo(600 - margin, 842 - margin)
            .lineTo(margin, 842 - margin)
            .lineTo(margin, margin)
            .lineTo(600 - margin, margin)
            .lineWidth(3)
            .strokeColor('#000000')
            .stroke();

        doc.moveDown();



        //   console.log("nothing");

        const headers = ['Order ID', 'Name', 'Date', 'Total'];

let headerX = 20;
const headerY = doc.y + 10;

doc.text(headers[0], headerX, headerY);
headerX += 200;

headers.slice(1).forEach(header => {
    doc.text(header, headerX, headerY);
    headerX += 130;
});

let dataY = headerY + 25;

orders.forEach(order => {
    const cleanedDataId = order.dataId.trim();
    const cleanedName = order.name.trim();

    doc.text(cleanedDataId, 20, dataY, { width: 200 });
    doc.text(cleanedName, 230, dataY);
    doc.text(order.date, 350, dataY, { width: 120 }); 
    doc.text(order.totalAmount, 490, dataY);
    
    dataY += 30;
});

        doc.end();
    } catch (error) {
        console.log(error.message);
    }
}


const downloadExcel = async (req, res) => {
    try {

        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet('Sales Report');

        worksheet.columns = [
            { header: 'Order ID', key: 'orderId', width: 50 },
            { header: 'Customer', key: 'customer', width: 30 },
            { header: 'Date', key: 'date', width: 30 },
            { header: 'Total', key: 'totalAmount', width: 15 },
            { header: 'Payment', key: 'payment', width: 15 },
        ];

        const orders = req.body;

        orders.forEach(order => {
            worksheet.addRow({
                orderId: order.orderId,
                customer: order.name,
                date: order.date,
                totalAmount: order.totalAmount,
                payment: order.payment,
                products: order.products,
            });
        });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename=salesReport.xlsx`);

        await workbook.xlsx.write(res);
        res.end();

    } catch (error) {
        console.log(error.message);
    }
}

const adminDashboard = async (req, res) => {
    try {
        const currentYear = new Date().getFullYear();
        let { year = currentYear, month } = req.query;

        // Convert year to a number     
        year = Number(year);

        // Validate the year
        if (isNaN(year) || year < 2000 || year > currentYear) {
            return res.status(400).send("Invalid year");
        }

        // If month is provided, validate and convert it to a number
        if (month !== undefined) {
            month = Number(month);
            // Validate the month
            if (isNaN(month) || month < 1 || month > 12) {
                console.log("Invalid month:", month);
                return res.status(400).send("Invalid month");
            }
        } else {
            // If month is not provided, set it to the current month
            const currentDate = new Date();
            month = currentDate.getMonth() + 1; // Months are zero-indexed, so add 1
        }

        const startOfYear = new Date(year, 0, 1);
        const endOfYear = new Date(year + 1, 0, 1);

        const [
            categories,
            deliveredOrders,
            products,
            users,
            monthlySales,
            latestOrders,
            bestSellingProducts,
            bestSellingCategories,
            bestSellingBrands
        ] = await Promise.all([
            Category.find({ isListed: true }),
            Order.find({ 
                status: "Delivered", 
                createdOn: { $gte: startOfYear, $lt: endOfYear } 
            }),
            Product.find({}),
            User.find({}),
            Order.aggregate([
                { 
                    $match: { 
                        status: "Delivered", 
                        createdOn: { $gte: startOfYear, $lt: endOfYear } 
                    } 
                },
                {
                    $group: {
                        _id: { 
                            year: { $year: "$createdOn" }, 
                            month: { $month: "$createdOn" } 
                        },
                        count: { $sum: 1 },
                        totalRevenue: { $sum: "$totalPrice" }
                    }
                },
                { $sort: { "_id.year": 1, "_id.month": 1 } }
            ]),
            // Fetch 5 latest orders with error handling
            Order.find()
                 .sort({ createdOn: -1 })
                 .limit(5)
                 .lean()
                 .then(orders => {
                     const filledOrders = Array(5).fill(null).map((_, index) => orders[index] || null);
                     return filledOrders;
                 }),
            // Best-selling products
            Order.aggregate([
                { 
                    $match: { 
                        status: "Delivered",
                        createdOn: { $gte: startOfYear, $lt: endOfYear }
                    }
                },
                { $unwind: "$product" },
                {
                    $lookup: {
                        from: "products",
                        localField: "product._id",
                        foreignField: "_id",
                        as: "productDetails"
                    }
                },
                { $unwind: "$productDetails" },
                {
                    $group: {
                        _id: "$productDetails._id",
                        productName: { $first: "$productDetails.productName" },
                        totalQuantity: { $sum: "$product.quantity" },
                        totalRevenue: { 
                            $sum: { 
                                $multiply: [
                                    "$product.quantity", 
                                    "$productDetails.salePrice"
                                ] 
                            }
                        }
                    }
                },
                {
                    $sort: { totalQuantity: -1 }
                },
                { $limit: 10 }
            ]),
            // Best-selling categories
            Order.aggregate([
                { 
                    $match: { 
                        status: "Delivered",
                        createdOn: { $gte: startOfYear, $lt: endOfYear }
                    }
                },
                { $unwind: "$product" },
                {
                    $lookup: {
                        from: "products",
                        localField: "product._id",
                        foreignField: "_id",
                        as: "productDetails"
                    }
                },
                { $unwind: "$productDetails" },
                {
                    $group: {
                        _id: "$productDetails.category",
                        totalQuantity: { $sum: "$product.quantity" },
                        totalRevenue: { 
                            $sum: { 
                                $multiply: [
                                    "$product.quantity", 
                                    "$productDetails.salePrice"
                                ] 
                            }
                        }
                    }
                },
                {
                    $sort: { totalQuantity: -1 }
                },
                { $limit: 10 }
            ]),
            // Best-selling brands
            Order.aggregate([
                { 
                    $match: { 
                        status: "Delivered",
                        createdOn: { $gte: startOfYear, $lt: endOfYear }
                    }
                },
                { $unwind: "$product" },
                {
                    $lookup: {
                        from: "products",
                        localField: "product._id",
                        foreignField: "_id",
                        as: "productDetails"
                    }
                },
                { $unwind: "$productDetails" },
                {
                    $group: {
                        _id: "$productDetails.brand",
                        totalQuantity: { $sum: "$product.quantity" },
                        totalRevenue: { 
                            $sum: { 
                                $multiply: [
                                    "$product.quantity", 
                                    "$productDetails.salePrice"
                                ] 
                            }
                        }
                    }
                },
                {
                    $sort: { totalQuantity: -1 }
                },
                { $limit: 10 }
            ])
        ]);

        // Calculate total revenue
        const totalRevenue = deliveredOrders.reduce((sum, order) => sum + order.totalPrice, 0);
console.log(totalRevenue ,'total revenue');

        // Calculate products added per month
        const productPerMonth = Array(12).fill(0);
        products.forEach(p => {
            const createdMonth = new Date(p.createdOn).getMonth();
            productPerMonth[createdMonth]++;
        });

        // Calculate monthly sales
        const monthlySalesArray = Array.from({ length: 12 }, (_, index) => {
            const monthData = monthlySales.find(item => item._id.month === index + 1 && item._id.year === year);
            return monthData ? monthData.count : 0;
        });

        // Render the admin dashboard with all calculated data
        res.render("index", {
            orderCount: deliveredOrders.length,
            productCount: products.length,
            categoryCount: categories.length,
            totalRevenue,
            monthlyRevenue: totalRevenue,
            monthlySalesArray,
            productPerMonth,
            latestOrders,
            bestSellingProducts,
            bestSellingCategories,
            bestSellingBrands,
            year,
            month
        });
    } catch (error) {
        console.error("Dashboard Error:", error);
        res.status(500).send("Internal Server Error");
    }
};

   
const dateWiseFilter = async (req, res)=>{
    try {
        console.log(req.query);
        const date = moment(req.query.date).startOf('day').toDate();

        const orders = await Order.aggregate([
            {
                $match: {
                    createdOn: {
                        $gte: moment(date).startOf('day').toDate(),
                        $lt: moment(date).endOf('day').toDate(),
                    },
                    status: "Delivered"
                }
            }
        ]);

        console.log(orders);

        let itemsPerPage = 5
        
        let currentPage = parseInt(req.query.page) || 1
        let startIndex = (currentPage - 1) * itemsPerPage
        let endIndex = startIndex + itemsPerPage
        let totalPages = Math.ceil(orders.length / 3)
        const currentOrder = orders.slice(startIndex, endIndex)

        res.render("salesReport", { data: currentOrder, totalPages, currentPage, salesMonthly: true , date})
       

    } catch (error) {
        console.log(error.message);
    }
}

const returnRequest = async (req, res) => {
    try {
        // Fetch and sort return requests by creation date in descending order
        const returnRequests = await Return.find({})
            .populate('userId')
            .populate('productId')
            .sort({ createdAt: -1 });

        // Render the results to the view
        res.render('adminReturnRequests', { returnRequests });
    } catch (error) {
        res.status(500).send('Error fetching return requests');
    }
};

const approveReturnRequest = async (req, res) => {
    const { returnId } = req.params;

    try {
        const returnRequest = await returnId.findById(returnId);
        if (!returnRequest) {
            return res.status(404).json({ message: 'Return request not found' });
        }

        // Update the return request status to approved
        returnRequest.status = 'Approved';
        await returnRequest.save();

        // Update the order and product stock as necessary
        const order = await Order.findById(returnRequest.orderId);
        if (!order) {
            return res.status(404).json({ message: 'Order not found' });
        }

        const user = await User.findById(returnRequest.userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Find the product in the order
        const productIndex = order.product.findIndex(p => p._id.toString() === returnRequest.productId.toString());
        if (productIndex === -1) {
            return res.status(404).json({ message: 'Product not found in order' });
        }

        const product = order.product[productIndex];
        console.log('Product before update:', product); // Debugging log

        // Calculate the return amount
        const returnAmount = product.price * returnRequest.quantity;

        // Update the product quantity in the order or remove if all returned
        if (returnRequest.quantity < product.quantity) {
            order.product[productIndex].quantity -= returnRequest.quantity;
            console.log('Product quantity after decrement:', order.product[productIndex].quantity); // Debugging log
        } else {
            order.product.splice(productIndex, 1);
            console.log('Product removed from order'); // Debugging log
        }

        // Adjust the order's total price
        order.totalPrice -= returnAmount;
        console.log('Order total price after adjustment:', order.totalPrice); // Debugging log

        // Mark the nested product array as modified
        order.markModified('product');

        // Update the order status to "Returned" if all products are returned
        if (order.product.length === 0) {
            order.status = "Returned";
            console.log('Order status set to Returned'); // Debugging log
        }

        // Save the updated order
        await order.save();

        // Update the product stock by incrementing the returned quantity
        await Product.findByIdAndUpdate(returnRequest.productId, {
            $inc: { quantity: returnRequest.quantity }
        });

        // Add money to user's wallet if payment method is wallet or online
        if (order.payment === "wallet" || order.payment === "online") {
            user.wallet += returnAmount;

            const newHistory = {
                amount: returnAmount,
                status: "credit",
                date: Date.now()
            };
            user.history.push(newHistory);

            await user.save();
        }

        res.status(200).json({ message: 'Return request approved successfully' });
    } catch (error) {
        console.error('Error approving return request:', error);
        res.status(500).json({ message: 'Error approving return request' });
    }
};



// Decline return request
const declineReturnRequest = async (req, res) => {
    const { returnId } = req.params;
 
    try {
        const returnRequest = await Return.findById(returnId);

        if (!returnRequest) {
            return res.status(404).json({ message: 'Return request not found' });
        }

        // Update the return request status to declined
        returnRequest.status = 'Declined';
        await returnRequest.save();

        res.status(200).json({ message: 'Return request declined successfully' });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error declining return request' });
    }
};

const dateRangeFilter = async (req, res) => {
    try {
        const { startDate, endDate } = req.query;
        if (!startDate || !endDate) {
            return res.status(400).send("Start date and end date are required");
        }

        const start = moment(startDate).startOf('day').toDate();
        const end = moment(endDate).endOf('day').toDate();

        const orders = await Order.aggregate([
            {
                $match: {
                    createdOn: {
                        $gte: start,
                        $lt: end,
                    },
                    status: "Delivered"
                }
            }
        ]);

        let itemsPerPage = 5;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage - 1) * itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(orders.length / itemsPerPage);
        const currentOrder = orders.slice(startIndex, endIndex);

        res.render("salesReport", { data: currentOrder, totalPages, currentPage, startDate, endDate });

    } catch (error) {
        console.log(error.message);
        res.status(500).send("Internal Server Error");
    }
}

module.exports = {
    adminDashboard,
    getLoginPage,
    verifyLogin,
    getCouponPageAdmin,
    createCoupon,
    getaddCoupon,
    getLogout,
    getSalesReportPage,
    salesToday,
    salesWeekly,
    salesMonthly,
    salesYearly,
    generatePdf,
    downloadExcel,
    dateRangeFilter,
    declineReturnRequest,
    approveReturnRequest,
    returnRequest,
    dateWiseFilter
}