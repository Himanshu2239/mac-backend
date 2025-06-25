import { Router } from "express";
import {
  loginUser,
  registerUser,
  //   refresh_token,
  //   changePassword,
} from "../controllers/user.js";

const router = Router();

router.route("/register").post(registerUser);
router.route("/login").post(loginUser);

// router.route("/refresh-token").post(refresh_token);

// router.route("/changePassword").post(changePassword);

export default router;
