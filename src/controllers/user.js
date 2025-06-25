import { asynchandler } from "../utils/asynchandler.js";
import { ApiError } from "../utils/apierror.js";
import { User } from "../models/user.js";
import { ApiResponse } from "../utils/apiresponse.js";
import jwt from "jsonwebtoken";
import { allowedRoles } from "../constant.js";

const generateAccessandRefreshToken = async (userId) => {
  // console.log("generateAccessandRefreshToken");
  try {
    const user = await User.findById(userId);
    const accessToken = await user.generateAccessToken();
    // console.log("accessToken", accessToken);
    const refreshToken = await user.generateRefreshToken();
    user.refreshToken = refreshToken;
    await user.save({ validateBeforeSave: false });
    return { refreshToken, accessToken };
  } catch (error) {
    return new ApiError(
      500,
      "Something went wrong while generating refresh and access token"
    );
  }
};

const registerUser = asynchandler(async (req, res) => {
  // Destructure required fields from request body
  console.log("req.body", req.body);
  const { fullName, jobId, password, role, email } = req.body;

  // 1. Basic validation (400 Bad Request)
  if (
    !email ||
    !fullName ||
    !jobId ||
    !password ||
    !role ||
    [fullName, jobId, password, role].some((field) => field.trim() === "")
  ) {
    throw new ApiError(
      400,
      "All fields (fullName, jobId, password, role, email) are required and must be non-empty."
    );
  }

  // 2. Role validation (400 Bad Request)
  if (!allowedRoles.includes(role)) {
    throw new ApiError(
      400,
      `Invalid role. Allowed roles are: ${allowedRoles.join(", ")}`
    );
  }

  try {
    // 3. Check if jobId already exists (409 Conflict)
    const existedUser = await User.findOne({ jobId: jobId.trim() });
    if (existedUser) {
      throw new ApiError(409, "User with the provided jobId already exists.");
    }

    // 4. Create a new user (might throw a 500 if MongoDB is down, schema validation fails, etc.)
    const user = await User.create({
      fullName: fullName.trim(),
      jobId: jobId.trim(),
      password: password.trim(),
      role: role.trim(),
      email: email.trim(),
    });

    if (!user) {
      // This is extremely unlikely—Mongoose would normally throw on failure—but just in case:
      throw new ApiError(
        500,
        "Something went wrong while registering the user."
      );
    }

    // 5. Retrieve and return the created user without sensitive fields
    const createdUser = await User.findById(user._id).select(
      "-password -refreshToken"
    );

    return res
      .status(201)
      .json(new ApiResponse(201, createdUser, "User registered successfully."));
  } catch (err) {
    // If the error is already an ApiError, re‐throw it so the asyncHandler sends it to your error middleware:
    if (err instanceof ApiError) {
      throw err;
    }

    // Otherwise, wrap any other unexpected error as a 500
    console.error("Unexpected error in registerUser:", err);
    throw new ApiError(500, "Internal server error. Please try again later.");
  }
});

const loginUser = asynchandler(async (req, res) => {
  // Destructure required fields from request body
  const { jobId, password } = req.body;
  // console.log("JobId", jobId, password);
  // Validate that both jobId and password are provided and non-empty
  if (!jobId || !password || jobId.trim() === "" || password.trim() === "") {
    throw new ApiError(
      400,
      "Both jobId and password are required and must be non-empty."
    );
  }

  // Find the user by jobId
  const user = await User.findOne({ jobId: jobId.trim() });
  if (!user) {
    throw new ApiError(400, "Invalid jobId or password.");
  }

  // console.log("user", user);

  // Verify the password
  const isPasswordValid = await user.isPasswordCorrect(password.trim());
  if (!isPasswordValid) {
    throw new ApiError(400, "Invalid jobId or password.");
  }

  // Generate access and refresh tokens
  const accessToken = await user.generateAccessToken();
  const refreshToken = await user.generateRefreshToken();

  // Update the user's refreshToken in the database
  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  // Retrieve the logged-in user details without password and refreshToken
  const loggedInUser = await User.findById(user._id).select(
    "-password -refreshToken"
  );

  return res.status(200).json(
    new ApiResponse(
      200,
      {
        user: loggedInUser,
        accessToken,
        refreshToken,
      },
      "User logged in successfully."
    )
  );
});

const refresh_token = asynchandler(async (req, res) => {
  // fetch data (req.body || req.header.cookies)
  // find the user in data (_id)
  // set accessToken in cookies for this.

  const incomingToken = req.cookies?.refreshToken || req.body.refreshToken;
  console.log(incomingToken);
  try {
    if (!incomingToken) {
      throw new ApiError(401, "Unauthorized request");
    }
    const decodedToken = jwt.verify(
      incomingToken,
      process.env.REFRESH_TOKEN_SECRET
    );
    if (!decodedToken) {
      throw new ApiError(
        400,
        "Something went wrong while decoding refresh Token"
      );
    }
    // console.log(decodedToken);
    const user = await User.findById(decodedToken?._id);
    // console.log("user", user);
    if (!user) {
      throw new ApiError(401, "Invalid refresh Token");
    }
    // console.log("userrefreshToken", user.refreshToken);
    if (incomingToken !== user?.refreshToken) {
      throw new ApiError(401, "Refresh token is expired or used");
    }
    const { refreshToken, accessToken } = await generateAccessandRefreshToken(
      user._id
    );
    console.log(refreshToken, accessToken);
    const options = {
      httpOnly: true,
      secure: true,
    };
    res
      .status(200)
      .cookie("accessToken", accessToken, options)
      .cookie("refreshToken", refreshToken, options)
      .json(
        new ApiResponse(
          200,
          { accessToken, refreshToken: refreshToken },
          "Access Token refreshed"
        )
      );
  } catch (error) {
    throw new ApiError(401, error?.message || "Invalid refresh Token");
  }
});

const changePassword = async (req, res) => {
  try {
    const { jobId, newPassword } = req.body;

    // Validate input
    if (!jobId || !newPassword) {
      return res.status(400).json({
        error: "Please provide both jobId and newPassword.",
      });
    }

    // Find the user by jobId
    const user = await User.findOne({ jobId });
    if (!user) {
      return res.status(404).json({
        error: "User not found.",
      });
    }

    // Set the new password
    user.password = newPassword;

    // Save the user - this will trigger the Mongoose pre-save hook to hash the password
    await user.save();

    return res.status(200).json({
      message: "Password changed successfully.",
    });
  } catch (error) {
    console.error("Error changing password:", error);
    return res.status(500).json({
      error: "An error occurred while changing the password.",
    });
  }
};

export { registerUser, loginUser, refresh_token, changePassword };
