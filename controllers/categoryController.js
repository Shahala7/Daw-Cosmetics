const Category = require("../models/categorySchema")
const Product = require("../models/productSchema")
const Subcategory =require('../models/subcategorySchema');
// Controller function to get subcategories by category ID



const getSubcategoriesByCategory = async (req, res) => {
    try {
        const { categoryId } = req.params;
        const category = await Category.findById(categoryId);

        if (!category || !category.subcategories) {
            return res.status(404).json({ message: 'Category not found or no subcategories available' });
        }

        
        res.json({ subcategories: category.subcategories });
    } catch (error) {
        console.error("Error:", error.message);
        res.status(500).send("Server Error");
    }
};


 const subcategories=async (req, res) => {
    try {
        const categories = await Category.find().populate('subcategories');
        res.json(categories);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch categories' });
    }
};

const getCategoryInfo = async (req, res) => {
    try {
        // Debug: Check total documents in Category collection
        const totalDocs = await Category.countDocuments({ isListed: true });
        console.log('Total active categories in database:', totalDocs);

        const page = parseInt(req.query.page) || 1;
        const limit = 3;
        const skip = (page - 1) * limit;

        let searchQuery = req.query.search || "";
        if (typeof searchQuery === 'string') {
            searchQuery = searchQuery.toLowerCase();
        }

        // Updated filter to include isListed check
        const filter = {
            name: { $regex: searchQuery, $options: "i" }
        };
        console.log('Filter being applied:', filter);

        // Get categories with pagination and populated subcategories
        const categories = await Category.find(filter)
            .populate({
                path: 'subcategories',
                select: 'subcategoryName isListed',
                match: { isListed: true }
            })
            .skip(skip)
            .limit(limit)
            .lean();

        console.log('Categories with pagination:', categories);
        console.log('Skip value:', skip);
        console.log('Limit value:', limit);

        const totalCategories = await Category.countDocuments(filter);

        // Changed the view path to match your directory structure
        res.render("category", {  // Removed "admin/" prefix
            categories: categories || [],
            currentPage: page,
            totalPages: Math.ceil(totalCategories / limit),
            searchQuery
        });
    } catch (error) {
        console.error("Error in getCategoryInfo:", error);
        res.status(500).send("An error occurred while retrieving categories.");
    }
};

const addCategory = async (req, res) => {
    try {
        const { name, description, newSubCategory } = req.body;

        // Validate required fields
        if (!name || !description) {
            return res.status(400).json({ 
                success: false, 
                message: "Name and description are required fields" 
            });
        }

        // Check if category exists (case-insensitive)
        const categoryExists = await Category.findOne({ 
            name: { $regex: new RegExp(`^${name}$`, 'i') }
        });
        
        if (categoryExists) {
            console.log("Category already exists");
            return res.status(409).json({
                success: false,
                message: "Category already exists"
            });
        }

        const subcategoriesArray = [];

        // Process subcategories if they exist
        if (Array.isArray(newSubCategory) && newSubCategory.length > 0) {
            for (const subCat of newSubCategory) {
                if (!subCat?.subcategoryName) continue;

                const existingSubcategory = await Subcategory.findOne({
                    subcategoryName: { 
                        $regex: new RegExp(`^${subCat.subcategoryName}$`, 'i') 
                    }
                });

                if (existingSubcategory) {
                    subcategoriesArray.push(existingSubcategory._id);
                    console.log("Using existing subcategory:", existingSubcategory.subcategoryName);
                } else {
                    const newSubcategory = new Subcategory({
                        subcategoryName: subCat.subcategoryName,
                        isListed: true
                    });

                    const savedSubcategory = await newSubcategory.save();
                    subcategoriesArray.push(savedSubcategory._id);
                    console.log("Created new subcategory:", savedSubcategory.subcategoryName);
                }
            }
        }

        // Create and save new category
        const newCategory = new Category({
            name: name.trim(),
            description: description.trim(),
            subcategories: subcategoriesArray,
            isListed: true,
            categoryOffer: 0
        });

        await newCategory.save();
        console.log("New Category created:", newCategory);

        res.redirect("/admin/category");

    } catch (error) {
        console.error("Error in addCategory:", error);
        res.status(500).json({
            success: false,
            message: "An error occurred while creating the category",
            error: error.message
        });
    }
};


const getAllCategories = async (req, res) => {
    {
        try {
            const page = parseInt(req.query.page) || 1;
            const limit = 5; // Limit the number of categories per page
            const totalCategories = await Category.countDocuments(); // Count total number of categories
            const totalPages = Math.ceil(totalCategories / limit); // Calculate total pages
            const categories = await Category.find()
                .skip((page - 1) * limit)
                .limit(limit);
    
            res.render('category', {
                categories,
                currentPage: page,
                totalPages // Pass totalPages to the view
            });
        } catch (err) {
            console.error(err);
            res.status(500).send('Server Error');
        }
    };
}
    
const getaddCategory = async (req, res) => {
    try {
        res.render("category-add")
    } catch (error) {
        console.log(error.message);
    }
}

const listCategory = async (req, res) => {
    try {
        const categoryId = req.query.id;
        if (!categoryId) {
            return res.status(400).send("Category ID is required");
        }

        await Category.findByIdAndUpdate(categoryId, { isListed: false });
        res.redirect("/admin/categories");
    } catch (error) {
        console.error("Error in listCategory:", error);
        res.status(500).send("An error occurred while updating category status");
    }
};

const unListCategory = async (req, res) => {
    try {
        const categoryId = req.query.id;
        if (!categoryId) {
            return res.status(400).send("Category ID is required");
        }

        await Category.findByIdAndUpdate(categoryId, { isListed: true });
        res.redirect("/admin/categories");
    } catch (error) {
        console.error("Error in unListCategory:", error);
        res.status(500).send("An error occurred while updating category status");
    }
};

const getEditCategory = async (req, res) => {
    try {
        const id = req.query.id
        const category = await Category.findOne({ _id: id })
        res.render("edit-category", { category: category })
    } catch (error) {
        console.log(error.message);
    }
}


const editCategory = async (req, res) => {
    try {
        const id = req.params.id
        const { categoryName, description } = req.body
        const findCategory = await Category.find({ _id: id })
        if (findCategory) {
            await Category.updateOne(
                { _id: id },
                {
                    name: categoryName,
                    description: description
                })
            res.redirect("/admin/category")
        } else {
            console.log("Category not found");
        }

    } catch (error) {
        console.log(error.message);
    }
}


const addCategoryOffer = async (req, res) => {
    try {
        const { id, offer } = req.query;
        if (!id || !offer) {
            return res.status(400).send("Category ID and offer percentage are required");
        }

        const offerValue = parseFloat(offer);
        if (isNaN(offerValue) || offerValue < 0 || offerValue > 100) {
            return res.status(400).send("Invalid offer percentage");
        }

        await Category.findByIdAndUpdate(id, { categoryOffer: offerValue });
        res.redirect("/admin/categories");
    } catch (error) {
        console.error("Error in addCategoryOffer:", error);
        res.status(500).send("An error occurred while adding category offer");
    }
};


const removeCategoryOffer = async (req, res) => {
    try {
        const { id } = req.query;
        if (!id) {
            return res.status(400).send("Category ID is required");
        }

        await Category.findByIdAndUpdate(id, { categoryOffer: 0 });
        res.redirect("/admin/categories");
    } catch (error) {
        console.error("Error in removeCategoryOffer:", error);
        res.status(500).send("An error occurred while removing category offer");
    }
};
module.exports = {
    getCategoryInfo,
    addCategory,
    getAllCategories,
    listCategory,
    unListCategory,
    editCategory,
    getEditCategory,
    addCategoryOffer,
    removeCategoryOffer,
    subcategories,
    getSubcategoriesByCategory,
    getaddCategory
}