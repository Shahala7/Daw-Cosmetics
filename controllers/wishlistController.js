const User = require("../models/userSchema")
const Product = require("../models/productSchema");


const getWishlistPage = async (req, res) => {
    try {
        const userId = req.session.user
        console.log(userId);
        const findUser = await User.findOne({ _id: userId })
        // console.log(findUser.wishlist, "user");
        
        res.render("wishlist", {data : findUser.wishlist, user : userId})
    } catch (error) {
        console.log(error.message);
    }
}

const addToWishlist = async (req, res) => {
    try {
        // Check if user is logged in
        if (!req.session.user) {
            return res.status(401).json({ 
                error: "User not found", 
                status: false 
            });
        }

        const { productId } = req.body;
        
        // Find the product
        const findProduct = await Product.findById(productId);
        if (!findProduct) {
            return res.status(404).json({ 
                error: "Product not found", 
                status: false 
            });
        }

        // Check if product already exists in wishlist
        const user = await User.findById(req.session.user);
        const existingWishlistItem = user.wishlist.find(
            item => item.productId.toString() === productId
        );

        if (existingWishlistItem) {
            return res.status(200).json({ 
                message: "Product already in wishlist", 
                status: true 
            });
        }

        // Add to wishlist
        const updateResult = await User.findByIdAndUpdate(
            req.session.user,
            {
                $push: {
                    wishlist: {
                        productId: productId,
                        image: findProduct.productImage[0],
                        productName: findProduct.productName,
                        category: findProduct.category,
                        salePrice: findProduct.salePrice,
                        brand: findProduct.brand,
                        units: findProduct.quantity
                    }
                }
            },
            { new: true }
        );

        if (!updateResult) {
            return res.status(500).json({ 
                error: "Failed to update wishlist", 
                status: false 
            });
        }

        res.status(200).json({ 
            message: "Product added to wishlist", 
            status: true 
        });

    } catch (error) {
        console.error('Wishlist Error:', error);
        res.status(500).json({ 
            error: "Internal server error", 
            status: false 
        });
    }
}


const deleteItemWishlist = async (req, res)=>{
    try {
        // console.log(req.query);
        const id = req.query.id
        await User.updateOne(
            { _id: req.session.user },
            {
                $pull: {
                    wishlist: { productId: id }
                }
            }
        )
        .then((data)=>console.log(data))
        res.redirect("/wishlist")
    } catch (error) {
        console.log(error.message);
    }
}

module.exports = {
    getWishlistPage,
    addToWishlist,
    deleteItemWishlist
}