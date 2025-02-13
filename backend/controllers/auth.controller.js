import User from "../models/user.model.js";
import jwt from "jsonwebtoken";
import { redis } from "../lib/redis.js";

const generateTokens = (userId) => {
  const accessToken = jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET, {
    expiresIn: "15m",
  });
  const refreshToken = jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, {
    expiresIn: "7d",
  });
  return { accessToken, refreshToken };
};

const storeRefreshToken = async (userId, refreshToken) => {
  await redis.set(
    `refreshToken:${userId}`,
    refreshToken,
    "EX",
    60 * 60 * 24 * 7
  ); //EX = expire in seconds
};

const setCookies = (res, accessToken, refreshToken) => {
  res.cookie("accessToken", accessToken, {
    httpOnly: true, //prevents access from javascript(XSS Attacks)
    secure: process.env.NODE_ENV === "production", //only works on https
    sameSite: "strict", //prevents CSRF Attacks
    maxAge: 1000 * 60 * 15, //15 minutes in milliseconds format
  });
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true, //prevents access from javascript(XSS Attacks)
    secure: process.env.NODE_ENV === "production", //only works on https
    sameSite: "strict", //prevents CSRF Attacks
    maxAge: 1000 * 60 * 60 * 24 * 7, //7 days in milliseconds format
  });
};

export const signup = async (req, res) => {
  const { email, password, name } = req.body;
  try {
    const userExists = await User.findOne({ email });
    if (userExists) {
      return res.status(400).json({
        message: "User Already Exists",
      });
    }
    const user = await User.create({
      name,
      email,
      password,
    });

    // AUTHENTICATE
    const { accessToken, refreshToken } = generateTokens(user._id);
    await storeRefreshToken(user._id, refreshToken);
    setCookies(res,accessToken,refreshToken);

    res.status(201).json({
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
    });
  } catch (error) {
    console.log("Error in signup controller", error.message);
    res.status(500).json({
      message: error.message,
    });
  }
};
export const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user=await User.findOne({email});
    if(user && (await user.comparePassword(password))){
        const {accessToken,refreshToken}=generateTokens(user._id);
        await storeRefreshToken(user._id,refreshToken);
        setCookies(res,accessToken,refreshToken);
        res.status(200).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role
        });
    }
  } catch (error) {
    console.log("Error in login controller", error.message);
    res.status(500).json({
      message: error.message,
    });
  }
};
export const logout = async (req, res) => {
  try {
    const refreshToken = req.cookies.refreshToken;
    if(refreshToken){
        const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
        await redis.del(`refreshToken:${decoded.userId}`);
    }

    res.clearCookie("accessToken");
    res.clearCookie("refreshToken");
    res.status(200).json({
        message: "Logged Out Successfully"
    });
  } catch (error) {
    res.status(500).json({
        message: "Error in logout controller",
        error: error.message
    });
  }
};

//This will refresh the access token
export const refreshToken = async(req,res)=>{
  try {
    const refreshToken=req.cookies.refreshToken;
    if(!refreshToken){
        return res.status(401).json({
            message: "No refresh token provided"
        });
    }
    const decoded=jwt.verify(refreshToken,process.env.REFRESH_TOKEN_SECRET);
    const storedToken= await redis.get(`refreshToken:${decoded.userId}`);

    if(storedToken!==refreshToken){
        return res.status(401).json({
            message: "Invalid refresh token"
        });
    }
    const accessToken=jwt.sign({userId:decoded.userId},process.env.ACCESS_TOKEN_SECRET,{
        expiresIn: "15m"
    });
    res.cookie("accessToken",accessToken,{
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        maxAge: 1000 * 60 * 15
    })

    res.status(200).json({
        message: "Access token refreshed"
    });

  } catch (error) {
    res.status(500).json({
      message: "Error in refresh token controller",
      error: error.message
    });
  }
};

// This will get the user profile
export const getProfile = async(req,res)=>{
  try {
    res.json(req.user);
  } catch (error) {
    res.status(500).json({
      message: "Error in get profile controller",
      error: error.message
    });
  }
}