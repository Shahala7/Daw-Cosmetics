const passport = require("passport");
const GoogleStrategy = require('passport-google-oauth2').Strategy;
const User = require('../models/userSchema');
require('dotenv').config();

// Serialize user to store in session
passport.serializeUser((user, done) => {
    done(null, user._id);
});

// Deserialize user from session
passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (err) {
        done(err, null);
    }
});
// Google OAuth Strategy
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: "https://dawcosmetics.shop/auth/google/callback", // Ensure this matches your registered redirect URI
    passReqToCallback: true
},
async (request, accessToken, refreshToken, profile, done) => {
    try {
        // console.log("Profile object:", profile);
        
        // Check if the user already exists
        let user = await User.findOne({ googleId: profile.id });
        // console.log(user.googleId,'1st user');
        if (!user) {
            // Create a new user if one doesn't exist
            user = await User.create({
                googleId: profile.id,
                name: profile.displayName || 'No Name', // Corrected to displayName
                email: profile.emails && profile.emails.length > 0 ? profile.emails[0].value : '',
                password: '', // Typically empty when using OAuth
                phone: '',
                isAdmin: false,
                isVerified: true,
                isBlocked: false,
                tocken: '',
                referalCode:'', // Assuming this is a placeholder or typo; correct as needed
            });
        }
console.log(user._id,'2nd user');

        // Store user info in session
        request.session.user = user._id;
        return done(null, user);
    } catch (err) {
        return done(err, null);
    }
}));

module.exports = passport;



