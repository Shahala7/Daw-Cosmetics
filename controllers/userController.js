const nodemailer = require("nodemailer")
const { v4: uuidv4 } = require("uuid");
const Cart=require("../models/cartSchema")
const bcrypt = require("bcryptjs");
const User = require("../models/userSchema");
const Brand = require("../models/brandSchema")
const Product = require("../models/productSchema");
const Category = require("../models/categorySchema");
const Coupon = require("../models/couponSchema")

const mongoose = require('mongoose');

const getShopPage = async (req, res) => {
    try {
      const user = (req.session.id);
      const option = req.query.option;
      const category = req.query.category;
      const brand = req.query.brand;
      const currentPage = parseInt(req.query.page) || 1;
      
      let products;
      if (option === 'lowToHigh') {
        products = await Product.find({ isBlocked: false }).sort({ salePrice: 1 });
      } else if (option === 'highToLow') {
        products = await Product.find({ isBlocked: false }).sort({ salePrice: -1 });
      } else {
        products = await Product.find({ isBlocked: false });
      }
      
      const count = products.length;
      const brands = await Brand.find({});
      const categories = await Category.find({ isListed: true });
      let itemsPerPage = 6;
      let startIndex = (currentPage - 1) * itemsPerPage;
      let endIndex = startIndex + itemsPerPage;
      let totalPages = Math.ceil(products.length / itemsPerPage);
      const currentProduct = products.slice(startIndex, endIndex);
      
      res.render("shop", {
        user: user,
        product: currentProduct,
        category: categories,
        brand: brands,
        count: count,
        totalPages,
        currentPage,
      });
    } catch (error) {
      console.log(error.message);
    }
  }

const pageNotFound = async (req, res) => {
    try {
        res.render("page-404")
    } catch (error) {
        console.log(error.message);
    }
}

// Function to generate a random OTP
const generateOtp = () => Math.floor(100000 + Math.random() * 900000).toString();

// Function to hash the password
const securePassword = async (password) => {
    const salt = await bcrypt.genSalt(10);
    return bcrypt.hash(password, salt);
};

// Signup User
const signupUser = async (req, res) => {
    try {
        const { email, phone, password, cPassword } = req.body;

        // Check if the email or phone number already exists
        const findUser = await User.findOne({ $or: [{ email }, { phone }] });

        if (password !== cPassword) {
            return res.render("signup", { message: "The confirm password does not match" });
        }

        if (findUser) {
            const message = findUser.email === email
                ? "User with this email already exists"
                : "User with this phone number already exists";
            return res.render("signup", { message });
        }

        // Generate OTP and send email
        const otp = generateOtp();
        console.log(otp, "Generated OTP");

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: 'shahalaahammedh7@gmail.com',
                pass: 'mnno xbnl edoy ozhi',
            },
            port: 587,
            secure: false,
            tls: {
                rejectUnauthorized: false,
            },
            logger: true,  // Enable debugging logs
            debug: true,   // Show detailed logs
        });
        
        const info = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: email,
            subject: "Verify Your Account ✔",
            text: `Your OTP is ${otp}`,
            html: `<b><h4>Your OTP is ${otp}</h4><br><a href="#">Click here</a></b>`,
        });

        if (info) {
            // Store OTP and user data in session
            req.session.userOtp = otp;
            req.session.userData = { ...req.body, otpExpiry: Date.now() + 10 * 60 * 1000 }; // 10 minutes
            return res.render("verify-otp", { email, message: "" });
        } else {
            return res.json({ error: "Failed to send email. Please try again." });
        }
    } catch (error) {
        console.error("Error during signup:", error);
        return res.render("signup", { message: "An error occurred. Please try again." });
    }
};


const verifyOtp = async (req, res) => {
    try {
        const { otp } = req.body;

        // Check if OTP is correct and not expired
        if (otp === req.session.userOtp && Date.now() <= req.session.userData.otpExpiry) {
            const { email, phone, password ,referalCode,name} = req.session.userData;

            // Hash the password
            const passwordHash = await securePassword(password);
            

            // Save user data to the database
            const newUser = new User({
                name:name,
                email: email,
                phone: phone,
                password: passwordHash,
                referalCode:uuidv4(),  // Generate a referral code
            });

            await newUser.save();

            // Set user session after successful signup
            req.session.user = newUser._id;
            res.json({ success: true, message: "Otp verified success" });

        } else {
            // OTP is incorrect or expired
            res.json({ success: false, email: req.session.userData.email,message: "Invalid or expired OTP. Please try again." });
        }

    } catch (error) {
        console.error(error.message);
        res.status(500).json({ success: false, message: "Something went wrong. Please try again." });
    }
};


// Render the OTP verification page
const getOtpPage = async (req, res) => {
    try {
        return res.render("verify-otp");
    } catch (error) {
        console.error(error.message);
        return res.status(500).json({ message: "An error occurred while rendering the OTP page" });
    }
};

const resendOtp = async (req, res) => {
    try {
        // Check if session data exists
        if (!req.session.userData || !req.session.userData.email) {
            return res.status(400).json({ success: false, message: "Session expired or user data not found. Please try signing up again." });
        }

        const otp = generateOtp();  // Generate new OTP
        const otpExpiry = Date.now() + 10 * 60 * 1000;  // OTP valid for 10 minutes

        req.session.userOtp = otp;
        req.session.userData.otpExpiry = otpExpiry;

        // Send new OTP via email
        const transporter = nodemailer.createTransport({
            service: "gmail",
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASSWORD,
            }
        });

        const info = await transporter.sendMail({
            from: process.env.EMAIL_USER,
            to: req.session.userData.email,  // Use the email from session data
            subject: "Your New OTP Code",
            text: `Your OTP code is ${otp}. It will expire in 10 minutes.`,
        });
          console.log(otp)
        if (info) {
            res.json({ success: true, message: "OTP has been resent successfully!" });

        } else {
            res.json({ success: false, message: "Failed to resend OTP. Please try again." });
        }

    } catch (error) {
        console.error(error.message);
        res.status(500).json({ success: false, message: "An error occurred while resending OTP." });
    }
};

// Make sure to define or import generateOtp function above this line

const getHomePage = async (req, res) => {
    try {
        
        const today = new Date().toISOString();
        const user = req.session.user
        console.log(user,'authuser');
        
        const categories = await Category.find({}).populate('subcategories');
        const userData = await User.findOne({})
        const brandData = await Brand.find({ isBlocked: false })
        const productData = await Product.find({ isBlocked: false }).sort({ id: -1 }).limit(4)
       const  transformedCategories =[]
            if (user) {
            res.render("home", { 
                user: userData, 
                data: brandData, 
                products: productData, 
                categories: transformedCategories  
            });
        } else {
            res.render("home", { 
                data: brandData, 
                products: productData, 
                categories: transformedCategories 
            });
        }
    } catch (error) {
        console.log(error.message)
    }
}

//Loading the Login Page

const getLoginPage = async (req, res) => {
    try {
        if (!req.session.user) {
            res.render("login")
        } else {
            res.redirect("/")
        }
    } catch (error) {
        console.log(error.message);
    }   
}


//Load signup page

const getSignupPage = async (req, res) => {
    try {
        if (!req.session.user) {
            res.render("signup")
        } else {
            res.redirect("/")
        }
    } catch (error) {
        console.log(error.message);
    }
}

//Generate OTP
   

const userLogin = async (req, res) => {
    try {
        const { email, password } = req.body
        const findUser = await User.findOne({ isAdmin: "0", email: email })

        console.log("working");

        if (findUser) {
            const isUserNotBlocked = findUser.isBlocked === false;

            if (isUserNotBlocked) {
                const passwordMatch = await bcrypt.compare(password, findUser.password)
                if (passwordMatch) {
                    req.session.user = findUser._id
                    console.log("Logged in");
                    res.redirect("/")
                } else {
                    console.log("Password is not matching");
                    res.render("login", { message: "Password is not matching" })
                }
            } else {
                console.log("User is blocked by admin");
                res.render("login", { message: "User is blocked by admin" })
            }
        } else {
            console.log("User is not found");
            res.render("login", { message: "User is not found" })
        }

    } catch (error) {
        console.log(error.message);
        res.render("login", { message: "Login failed" })
    }
}


const getLogoutUser = async (req, res) => {
    try {
        req.session.destroy((err) => {
            if (err) {
                console.log(err.message);
            }
            console.log("Logged out");
            res.redirect("/login")
        })
    } catch (error) {
        console.log(error.message);
    }
}

const getProductDetailsPage = async (req, res) => {
    try {
        const user = req.session.user;
        const id = req.query.id;

        // Validate if ID exists
        if (!id) {
            return res.redirect('/pageNotFound'); // Redirect to home page if no ID
        }

        // Find the product by its id
        const findProduct = await Product.findOne({ id: parseInt(id) }).lean();
        
        if (!findProduct) {
            console.log(`Failed to find product with ID: ${id}`);
            return res.redirect('/pageNotFound') // Redirect to home page if product not found
        }

        let totalOffer = 0;
        
        // Calculate total offer combining category and product offers
        if (findProduct.categoryOffer) {
            totalOffer += findProduct.categoryOffer;
        }
        
        if (findProduct.productOffer) {
            totalOffer += findProduct.productOffer;
        }

        // Prepare render data
        const renderData = {
            data: findProduct,
            totalOffer
        };

        // Add user to render data if it exists
        if (user) {
            renderData.user = user;
        }

        // Render the product details page
        return res.render("product-details", renderData);

    } catch (error) {
        console.error('Error in getProductDetailsPage:', error);
        res.redirect('/pageNotFound')
    }
};
const searchProducts = async (req, res) => {
    try {
        const user = req.session.user
        let search = req.query.search
        const brands = await Brand.find({})
        const categories = await Category.find({ isListed: true })

        const searchResult = await Product.find({
            $or: [
                {
                    productName: { $regex: ".*" + search + ".*", $options: "i" },
                }
            ],
            isBlocked: false,
        }).lean()

        let itemsPerPage = 6
        let currentPage = parseInt(req.query.page) || 1
        let startIndex = (currentPage - 1) * itemsPerPage
        let endIndex = startIndex + itemsPerPage
        let totalPages = Math.ceil(searchResult.length / 6)
        const currentProduct = searchResult.slice(startIndex, endIndex)


        res.render("shop",
            {
                user: user,
                product: currentProduct,
                category: categories,
                brand: brands,
                totalPages,
                currentPage
            })

    } catch (error) {
        console.log(error.message);
    }
}

const filterProduct = async (req, res) => {
    try {
        const user = req.session.user;
        const category = req.query.category;
        const brand = req.query.brand;
        const brands = await Brand.find({});
        const findCategory = category ? await Category.findOne({ _id: category }) : null;
        const findBrand = brand ? await Brand.findOne({ _id: brand }) : null;

console.log(findCategory,"findcategory");


        const query = {
            isBlocked: false,
        };

        if (findCategory) {
            query.category = findCategory.name;
        
            
        }

        if (findBrand) {
            query.brand = findBrand.brandName;
        }

        const findProducts = await Product.find(query);
        
        const categories = await Category.find({ isListed: true });


        let itemsPerPage = 6;
        let currentPage = parseInt(req.query.page) || 1;
        let startIndex = (currentPage - 1) * itemsPerPage;
        let endIndex = startIndex + itemsPerPage;
        let totalPages = Math.ceil(findProducts.length / 6);
        const currentProduct = findProducts.slice(startIndex, endIndex);

        res.render("shop", {
            user: user,
            product: currentProduct,
            category: categories,
            brand: brands,
            totalPages,
            currentPage,
            selectedCategory: category || null,
            selectedBrand: brand || null,
        });

    } catch (error) {
        console.log(error.message);
        res.status(500).send("Internal Server Error");
    }
};

const filterByPrice = async (req, res) => {
    try {
        const user = req.session.user;
        const brands = await Brand.find({});
        const categories = await Category.find({ isListed: true });

        // Parsing query parameters for price filtering and pagination
        const minPrice = parseFloat(req.query.gt) || 0;  // Minimum price (greater than)
        const maxPrice = parseFloat(req.query.lt) || Number.MAX_VALUE;  // Maximum price (less than)
        const itemsPerPage = 6;
        const currentPage = parseInt(req.query.page) || 1;

        // Fetching filtered products with pagination
        const totalProducts = await Product.countDocuments({
            $and: [
                { salePrice: { $gt: minPrice, $lt: maxPrice } }, // Price filter
                { isBlocked: false } // Only fetch unblocked products
            ]
        });

        // Calculating pagination offsets
        const totalPages = Math.ceil(totalProducts / itemsPerPage);
        const skip = (currentPage - 1) * itemsPerPage;

        // Fetching paginated results
        const findProducts = await Product.find({
            $and: [
                { salePrice: { $gt: minPrice, $lt: maxPrice } },
                { isBlocked: false }
            ]
        })
        .skip(skip)
        .limit(itemsPerPage);

        // Render the shop page with the filtered and paginated products
        res.render("shop", {
            user: user,
            product: findProducts,
            category: categories,
            brand: brands,
            totalPages,
            currentPage,
        });

    } catch (error) {
        console.log(error.message);
        res.status(500).send('Internal server error');
    }
};
// Assuming your Product model is imported
const getSortProducts = async (req, res) => {
    try {
        const { option, category, brand, page = 1, caseSensitive = false } = req.body;
        const itemsPerPage = 6;

        // Base filter criteria
        const filterCriteria = { isBlocked: false };
        if (category) {
            filterCriteria.category = category;
        }
        if (brand) {
            filterCriteria.brand = brand;
        }

        let query = Product.find(filterCriteria);

        // Handle sorting
        switch (option) {
            case "highToLow":
                query = query.sort({ salePrice: -1 });
                break;
            case "lowToHigh":
                query = query.sort({ salePrice: 1 });
                break;
            case "AZ":
                if (caseSensitive) {
                    // Use MongoDB collation for case-sensitive sorting
                    query = query.collation({ locale: 'en', strength: 3 })
                               .sort({ productName: 1 });
                } else {
                    // Convert to lowercase for case-insensitive sorting
                    query = query.sort({ 
                        productName: 1 
                    }).collation({ locale: 'en', strength: 2 });
                }
                break;
            case "ZA":
                if (caseSensitive) {
                    // Use MongoDB collation for case-sensitive sorting
                    query = query.collation({ locale: 'en', strength: 3 })
                               .sort({ productName: -1 });
                } else {
                    // Convert to lowercase for case-insensitive sorting
                    query = query.sort({ 
                        productName: -1 
                    }).collation({ locale: 'en', strength: 2 });
                }
                break;
            case "newToOld":
                query = query.sort({ createdOn: -1 });
                break;
            case "oldToNew":
                query = query.sort({ createdOn: 1 });
                break;
            default:
                query = query.sort({ salePrice: -1 });
                break;
        }

        // Apply pagination
        const data = await query
            .skip((page - 1) * itemsPerPage)
            .limit(itemsPerPage);

        // Get total count for pagination
        const count = await Product.countDocuments(filterCriteria);
        const totalPages = Math.ceil(count / itemsPerPage);

        res.json({
            status: true,
            data: {
                currentProduct: data,
                count,
                totalPages,
                currentPage: parseInt(page),
                sortOption: option,
                caseSensitive
            }
        });
    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).json({ status: false, error: error.message });
    }
};
const applyCoupon = async (req, res) => {
    try {
        const userId = req.session.user
        console.log(req.body);
        const selectedCoupon = await Coupon.findOne({ name: req.body.coupon })
        // console.log(selectedCoupon);
        if (!selectedCoupon) {
            console.log("no coupon");
            res.json({ noCoupon: true })
        } else if (selectedCoupon.userId.includes(userId)) {
            console.log("already used");
            res.json({ used: true })
        } else {
            console.log("coupon exists");
            await Coupon.updateOne(
                { name: req.body.coupon },
                {
                    $addToSet: {
                        userId: userId
                    }
                }
            );
            const gt = parseInt(req.body.total) - parseInt(selectedCoupon.offerPrice);
            console.log(gt, "----");
            res.json({ gt: gt, offerPrice: parseInt(selectedCoupon.offerPrice) })
        }
    } catch (error) {
        console.log(error.message);
    }
}


module.exports = {
    getHomePage,
    getLoginPage,
    getSignupPage,
    userLogin,
    getLogoutUser,
    getProductDetailsPage,
    pageNotFound,
    getShopPage,
    signupUser,
    getOtpPage,
    verifyOtp,
    resendOtp,
    filterByPrice, 
    filterProduct,
    searchProducts,
    getSortProducts,
    applyCoupon,
}