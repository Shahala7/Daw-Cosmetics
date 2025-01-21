const Product = require("../models/productSchema");
const Category = require("../models/categorySchema");
const Brand = require("../models/brandSchema");
const { subcategories } = require("../models/subcategorySchema");
const Mongoose = require('mongoose');
const fs = require("fs");
const path = require("path");



const getProductAddPage = async (req, res) => {
    try {
        const categories = await Category.find().populate('subcategories');
        const brands = await Brand.find({ isBlocked: false });
        
        // Extract subcategories from the populated categories
        const subcategories = categories
            .filter(cat => Array.isArray(cat.subcategories))
            .map(cat => cat.subcategories)
            .flat();
        
        res.render("product-add", {
            cat: categories,    // For backwards compatibility with existing template
            brand: brands,      // Changed to match template expectation
            subcategories
        });
    } catch (error) {
        console.error("Error loading product add page:", error);
        res.status(500).render("error", {
            message: "Error loading product add page"
        });
    }
};

const subCat = async (req, res) => {
    try {
        const { categoryId } = req.body;

        // Fetch the category with its subcategories
        const category = await Category.findOne({name:categoryId}).populate('subcategories');
        if (!category) {
            return res.status(404).json({ error: 'Category not found' });
        }
        console.log(category)
        // Filter subcategories
        const filteredSubcategories = category.subcategories
            .filter(subcat => subcat.isListed)
            .map(subcat => ({
                _id: subcat._id,
                subcategoryName: subcat.subcategoryName
            }));

        console.log('Filtered subcategories:', filteredSubcategories);
        
        res.json(filteredSubcategories);
        
    } catch (error) {
        console.error('Error fetching subcategories:', error);
        res.status(500).json({ error: 'Server error' });
    }
};


const getSubcategories = async (req, res) => {
    try {
        const { categoryId } = req.body;
        
        if (!Mongoose.Types.ObjectId.isValid(categoryId)) {
            return res.status(400).json({ 
                success: false,
                error: 'Invalid category ID' 
            });
        }

        const category = await Category.findById(categoryId).populate('subcategories');
        
        if (!category) {
            return res.status(404).json({ 
                success: false,
                error: 'Category not found' 
            });
        }

        const filteredSubcategories = category.subcategories
            .filter(subcat => subcat.isListed)
            .map(subcat => ({
                _id: subcat._id,
                subcategoryName: subcat.subcategoryName
            }));

        res.json({
            success: true,
            subcategories: filteredSubcategories
        });
        
    } catch (error) {
        console.error('Error fetching subcategories:', error);
        res.status(500).json({ 
            success: false,
            error: 'Server error' 
        });
    }
};

// Add new product
const addProducts = async (req, res) => {
    try {
        const files = req.files;
        const products = req.body;

        // Check if the product already exists
        const productExists = await Product.findOne({
            productName: { $regex: new RegExp(`^${products.productName}$`, 'i') }
        });

        if (productExists) {
            return res.status(400).json({
                success: false,
                message: "Product already exists"
            });
        }

        // Validate and process images
        const images = [];
        if (files && files.length >= 3) {
            files.forEach((file) => {
                images.push(file.filename);
            });
        } else {
            return res.status(400).json({
                success: false,
                message: "At least 3 images are required"
            });
        }

        // Validate prices
        const regularPrice = parseFloat(products.regularPrice);
        const salePrice = products.salePrice ? parseFloat(products.salePrice) : regularPrice;

        if (isNaN(regularPrice) || regularPrice <= 0) {
            return res.status(400).json({
                success: false,
                message: "Invalid regular price"
            });
        }

        if (salePrice > regularPrice) {
            return res.status(400).json({
                success: false,
                message: "Sale price cannot be higher than regular price"
            });
        }

        // Validate category and subcategory
        if (!products.category || !products.category.trim()) {
            return res.status(400).json({
                success: false,
                message: "Category is required"
            });
        }

        if (!products.subcategory || !products.subcategory.trim()) {
            return res.status(400).json({
                success: false,
                message: "Subcategory is required"
            });
        }

        // Create a new product with category name
        const newProduct = new Product({
            id: Date.now().toString(), // Converting to string as per schema
            productName: products.productName.trim(),
            description: products.description.trim(),
            brand: products.brand.trim(),
            category: products.category.trim(), // Saving category name directly
            subcategory: products.subcategory.trim(), // Saving subcategory name directly
            regularPrice: regularPrice,
            salePrice: salePrice,
            createdOn: new Date().toISOString(), // Converting to string as per schema
            quantity: parseInt(products.quantity) || 0,
            productImage: images,
            isBlocked: false,
            productOffer: 0
        });

        await newProduct.save();

        return res.redirect('/admin/products')
    } catch (error) {
        console.error("Error adding product:", error);
        return res.status(500).json({
            success: false,
            message: "Internal Server Error",
            error: error.message
        });
    }
};

const getEditProduct = async (req, res) => {
    try {
        const id = req.query.id;

        // Find the product by ID
        const findProduct = await Product.findOne({ _id: id }).lean();

        if (!findProduct) {
            return res.status(404).render("error", {
                message: "Product not found",
            });
        }

        // Fetch categories and populate subcategories
        const categories = await Category.find().populate("subcategories").lean();

        // Extract subcategories for use in the template
        const subcategories = categories
            .filter((cat) => Array.isArray(cat.subcategories))
            .map((cat) => cat.subcategories)
            .flat();

        // Fetch brands that are not blocked
        const brands = await Brand.find({ isBlocked: false }).lean();

        res.render("edit-product", {
            product: findProduct, // Send the product details to the template
            cat: categories,      // Categories with subcategories
            subcategories,        // Extracted subcategories
            brand: brands,        // Available brands
        });
    } catch (error) {
        console.error("Error loading edit product page:", error);
        res.status(500).render("error", {
            message: "Error loading edit product page",
        });
    }
};
const editProduct = async (req, res) => {
    try {
        const id = req.params.id;
        const data = req.body;
        const images = [];

        // Find the existing product to get current images
        const existingProduct = await Product.findById(id);
        if (!existingProduct) {
            req.flash('error', 'Product not found');
            return res.redirect("/admin/products");
        }

        // Handle image uploads
        if (req.files && req.files.length > 0) {
            // Add new uploaded images
            for (let i = 0; i < req.files.length; i++) {
                images.push(req.files[i].filename);
            }
        }

        // Determine final images (new uploads or existing)
        const finalImages = images.length > 0
            ? [...existingProduct.productImage, ...images]
            : existingProduct.productImage;

        // Ensure uniqueness of images and limit to 5
        const uniqueImages = [...new Set(finalImages)].slice(0, 5);

        // Prepare update object
        const updateData = {
            productName: data.productName || existingProduct.productName,
            description: data.description || existingProduct.description,
            brand: data.brand || existingProduct.brand,
            category: data.category || existingProduct.category,
            subcategory: data.subcategory || existingProduct.subcategory,
            regularPrice: data.regularPrice || existingProduct.regularPrice,
            salePrice: data.salePrice || data.regularPrice || existingProduct.salePrice,
            quantity: data.quantity || existingProduct.quantity,
            productImage: uniqueImages,
            createdOn: existingProduct.createdOn,
            updatedAt: new Date(),
        };

        // Update product
        const updatedProduct = await Product.findByIdAndUpdate(id, updateData, { 
            new: true,
            runValidators: true,
        });

        if (!updatedProduct) {
            req.flash('error', 'Failed to update product');
            return res.redirect("/admin/products");
        }

        req.flash('success', 'Product updated successfully');
        res.redirect("/admin/products");

    } catch (error) {
        console.error("Error in editProduct:", error);
        req.flash('error', 'Failed to update product');
        res.redirect("/admin/products");
    }
};


const deleteSingleImage = async (req, res) => {
    try {
        console.log("hi");
        const id = req.body.productId
        const image = req.body.filename
        console.log(id, image);
        const product = await Product.findByIdAndUpdate(id, {
            $pull: { productImage: image }
        })
        // console.log(image);
        const imagePath = path.join('public', 'uploads', 'product-images', image);
        if (fs.existsSync(imagePath)) {
            await fs.unlinkSync(imagePath);
            console.log(`Image ${image} deleted successfully`);
            res.json({ success: true })
        } else {
            console.log(`Image ${image} not found`);
        }

        

    } catch (error) {
        console.log(error.message);
    }
}

const getAllProducts = async (req, res) => {
    try {
        const search = req.query.search || ""
        const page = req.query.page || 1
        const limit = 4
        const productData = await Product.find({
            $or: [
                { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },
                { brand: { $regex: new RegExp(".*" + search + ".*", "i") } }
            ],
        })
            .sort({ createdOn: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit)
            .exec()

        const count = await Product.find({
            $or: [
                { productName: { $regex: new RegExp(".*" + search + ".*", "i") } },
                { brand: { $regex: new RegExp(".*" + search + ".*", "i") } }
            ],
        }).countDocuments()

            res.render("products", {
            data: productData,
            currentPage: page,
            totalPages: Math.ceil(count / limit)

        });

    } catch (error) {
        console.log(error.message);
    }
}


const getBlockProduct = async (req, res) => {
    try {
        let id = req.query.id
        await Product.updateOne({ _id: id }, { $set: { isBlocked: true } })
        console.log("product blocked")
        res.redirect("/admin/products")
    } catch (error) {
        console.log(error.message);
    }
}


const getUnblockProduct = async (req, res) => {
    try {
        let id = req.query.id
        await Product.updateOne({ _id: id }, { $set: { isBlocked: false } })
        console.log("product unblocked")
        res.redirect("/admin/products")
    } catch (error) {
        console.log(error.message);
    }
}

const addProductOffer = async (req, res) => {
    try {
        // console.log(req.body);
        const { productId, percentage } = req.body
        const findProduct = await Product.findOne({ _id: productId })
        // console.log(findProduct);

        findProduct.salePrice = findProduct.salePrice - Math.floor(findProduct.regularPrice * (percentage / 100))
        findProduct.productOffer = parseInt(percentage)
        await findProduct.save()

        res.json({ status: true })

    } catch (error) {
        console.log(error.message);
    }
}

const removeProductOffer = async (req, res) => {
    try {
        // console.log(req.body);
        const {productId} = req.body
        const findProduct = await Product.findOne({_id : productId})
        // console.log(findProduct);
        const percentage = findProduct.productOffer
        findProduct.salePrice = findProduct.salePrice + Math.floor(findProduct.regularPrice * (percentage / 100))
        findProduct.productOffer = 0
        await findProduct.save()
        res.json({status : true})
    } catch (error) {
        console.log(error.message);
    }
}

module.exports = {
    getProductAddPage,
    getAllProducts,
    getBlockProduct,
    getUnblockProduct,
    getEditProduct,
    editProduct,
    deleteSingleImage,
    addProductOffer,
    removeProductOffer,
    addProducts,
    getSubcategories,
    subCat
   
}
