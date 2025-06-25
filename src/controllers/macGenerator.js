// controllers/macGeneratorController.js
import mongoose from "mongoose";
import { MacGenerator } from "../models/mac-generator.js";
import { Counter } from "../models/counter.js";
import crypto from "crypto";

// month → code mapping: Jan=A, Feb=B, … Dec=L
const MONTH_CODES = [
  "A",
  "B",
  "C",
  "D",
  "E",
  "F",
  "G",
  "H",
  "I",
  "J",
  "K",
  "L",
];

const registerMacGenerator = async (req, res) => {
  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    const {
      customerName,
      customerPo,
      customerPoDate,
      itemType,
      customerModel,
      oemModel,
      odmModel,
      itemQuantity,
    } = req.body;

    // 2) Basic validation
    if (
      !customerName ||
      !customerPo ||
      !customerPoDate ||
      !itemType ||
      !customerModel ||
      !oemModel ||
      !odmModel ||
      !itemQuantity
    ) {
      if (session.inTransaction()) await session.abortTransaction();
      return res.status(400).json({
        error:
          "Missing required fields: customerName, customerPo, customerPoDate, itemType, customerModel, oemModel, odmModel, itemQuantity",
      });
    }

    // 3) Atomically bump our custom counter *inside* the session
    const ctr = await Counter.findOneAndUpdate(
      { name: "macGenerator" },
      { $inc: { seq: 1 } },
      { new: true, upsert: true, session }
    );
    const orderSeq = ctr.seq;

    // 4) Build the workOrderNumber from that seq
    const now = new Date();
    const mthCode = MONTH_CODES[now.getMonth()];
    const yy = String(now.getFullYear() % 100).padStart(2, "0");
    const seqStr = String(orderSeq).padStart(2, "0");
    const workOrderNumber = `RRE${mthCode}${yy}${seqStr}`;

    // 5) Create MacGenerator with session
    const macGen = await MacGenerator.create(
      [
        {
          workOrderNumber,
          orderSequence: orderSeq,

          customerName,
          customerPo,
          customerPoDate,
          itemType,
          customerModel,
          oemModel,
          odmModel,
          itemQuantity,
          // generation fields left blank for now
        },
      ],
      { session }
    );

    await session.commitTransaction();
    return res.status(201).json({
      message: "Registration successful",
      workOrderNumber,
      id: macGen[0]._id,
    });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    console.error("Transaction error:", err);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    session.endSession();
  }
};

// const generateParameters = async (req, res) => {
//   const { id } = req.params;
//   if (!mongoose.Types.ObjectId.isValid(id)) {
//     return res.status(400).json({ error: "Invalid work-order ID" });
//   }

//   const session = await mongoose.startSession();
//   try {
//     session.startTransaction();

//     // 1) Load the work-order
//     const macGen = await MacGenerator.findById(id).session(session);
//     if (!macGen) {
//       await session.abortTransaction();
//       return res.status(404).json({ error: "Work-order not found" });
//     }

//     // 2) Destructure payload
//     const {
//       startMacId,
//       requiredPerDevice,
//       startHwSnPrefix,
//       startHwSnSuffix,
//       startPonSnPrefix,
//       macVendorName,
//     } = req.body;

//     // 3) Common validation
//     const errs = [];
//     if (!startMacId) errs.push("startMacId");
//     if (requiredPerDevice == null) errs.push("requiredPerDevice");
//     if (!startHwSnPrefix) errs.push("startHwSnPrefix");
//     if (!startHwSnSuffix) errs.push("startHwSnSuffix");
//     if (!macVendorName) errs.push("macVendorName");

//     // 4) ONT-only fields
//     if (macGen.itemType === "ONT") {
//       if (!startPonSnPrefix) errs.push("startPonSnPrefix");
//     }

//     // 5) SWITCH shouldn’t send ONT fields
//     if (macGen.itemType === "SWITCH") {
//       if (startPonSnPrefix) {
//         return res.status(400).json({
//           error: "ONT-only fields not allowed for SWITCH",
//         });
//       }
//     }

//     if (errs.length) {
//       await session.abortTransaction();
//       return res.status(400).json({
//         error: "Missing required fields: " + errs.join(", "),
//       });
//     }

//     // 6) Apply updates
//     macGen.startMacId = startMacId;
//     macGen.requiredPerDevice = requiredPerDevice;
//     macGen.startHwSnPrefix = startHwSnPrefix;
//     macGen.startHwSnSuffix = startHwSnSuffix;
//     macGen.macVendorName = macVendorName;

//     if (macGen.itemType === "ONT") {
//       macGen.startPonSnPrefix = startPonSnPrefix;
//     }

//     await macGen.save({ session });

//     await session.commitTransaction();
//     return res.status(200).json({
//       message: "Parameters saved",
//       workOrderNumber: macGen.workOrderNumber,
//       id: macGen._id,
//     });
//   } catch (err) {
//     if (session.inTransaction()) await session.abortTransaction();
//     console.error("Transaction error:", err);
//     return res.status(500).json({ error: "Internal server error" });
//   } finally {
//     session.endSession();
//   }
// };

const generateParameters = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid work-order ID" });
  }

  const session = await mongoose.startSession();
  try {
    await session.startTransaction();

    // 1) Load the work-order
    const macGen = await MacGenerator.findById(id).session(session);
    if (!macGen) {
      await session.abortTransaction();
      return res.status(404).json({ error: "Work-order not found" });
    }

    // 2) Destructure payload
    const {
      startMacId,
      requiredPerDevice,
      startHwSnPrefix,
      startHwSnSuffix,
      startPonSnPrefix,
      macVendorName,
      macIdRequired,
    } = req.body;

    // 3) Common validation
    const errs = [];
    if (!startMacId) errs.push("startMacId");
    if (requiredPerDevice == null) errs.push("requiredPerDevice");
    if (!startHwSnPrefix) errs.push("startHwSnPrefix");
    if (!startHwSnSuffix) errs.push("startHwSnSuffix");
    if (!macVendorName) errs.push("macVendorName");
    if (macGen.itemType === "ONT" && !startPonSnPrefix) {
      errs.push("startPonSnPrefix");
    }
    if (macGen.itemType === "SWITCH" && startPonSnPrefix) {
      return res.status(400).json({
        error: "ONT-only fields not allowed for SWITCH",
      });
    }
    if (errs.length) {
      await session.abortTransaction();
      return res
        .status(400)
        .json({ error: "Missing required fields: " + errs.join(", ") });
    }

    // 4) Compute the new MAC‐ID range
    const macWidth = startMacId.length;
    const newStart = BigInt("0x" + startMacId);
    const totalMacs = BigInt(requiredPerDevice) * BigInt(macGen.itemQuantity);
    const newEnd = newStart + totalMacs - BigInt(1);
    const newEndHex = newEnd.toString(16).toUpperCase().padStart(macWidth, "0");

    // 5) Check against all other work-orders
    const others = await MacGenerator.find({
      _id: { $ne: id },
      startMacId: { $exists: true, $ne: null },
    })
      .session(session)
      .lean();

    for (const o of others) {
      if (!o.startMacId || o.requiredPerDevice == null) continue;
      const oStart = BigInt("0x" + o.startMacId);
      const oTotal = BigInt(o.requiredPerDevice) * BigInt(o.itemQuantity);
      const oEnd = oStart + oTotal - BigInt(1);

      // ranges overlap if not (oEnd < newStart || oStart > newEnd)
      if (!(oEnd < newStart || oStart > newEnd)) {
        await session.abortTransaction();
        return res.status(400).json({
          error: `Requested MAC‐ID range ${startMacId}-${newEndHex} overlaps with work-order ${o.workOrderNumber}`,
        });
      }
    }

    // 6) All clear → apply updates
    macGen.startMacId = startMacId;
    macGen.requiredPerDevice = requiredPerDevice;
    macGen.startHwSnPrefix = startHwSnPrefix;
    macGen.startHwSnSuffix = startHwSnSuffix;
    macGen.macVendorName = macVendorName;
    macGen.macIdRequired = macIdRequired;
    macGen.excelFileGenerated = true;
    if (macGen.itemType === "ONT") {
      macGen.startPonSnPrefix = startPonSnPrefix;
    }

    await macGen.save({ session });
    await session.commitTransaction();

    return res.status(200).json({
      message: "Parameters saved",
      workOrderNumber: macGen.workOrderNumber,
      id: macGen._id,
    });
  } catch (err) {
    if (session.inTransaction()) await session.abortTransaction();
    console.error("Transaction error:", err);
    return res.status(500).json({ error: "Internal server error" });
  } finally {
    session.endSession();
  }
};

const getGenerationResultsForONT = async (req, res) => {
  const { id } = req.params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid work-order ID" });
  }

  const gen = await MacGenerator.findById(id);
  if (!gen) {
    return res.status(404).json({ error: "Work-order not found" });
  }
  if (gen.itemType !== "ONT") {
    return res
      .status(400)
      .json({ error: "This endpoint only supports ONT work-orders" });
  }

  const {
    startMacId,
    requiredPerDevice,
    startHwSnPrefix,
    startHwSnSuffix = "",
    startPonSnPrefix,
    macIdRequired,
  } = gen;

  // validate we have what we need
  const missing = [];
  if (!startMacId) missing.push("startMacId");
  if (!requiredPerDevice) missing.push("requiredPerDevice");
  if (!startHwSnPrefix) missing.push("startHwSnPrefix");
  if (!startHwSnSuffix) missing.push("startHwSnSuffix");
  if (!startPonSnPrefix) missing.push("startPonSnPrefix");
  if (missing.length) {
    return res.status(400).json({
      error: "Missing generation parameters: " + missing.join(", "),
    });
  }

  const numDevices = gen.itemQuantity;
  const baseMacInt = BigInt("0x" + startMacId);
  const macWidth = startMacId.length;

  // figure out HW-SN padding
  const hwStart = parseInt(startHwSnSuffix, 10) || 0;
  const hwPadLen =
    startHwSnSuffix.length || String(hwStart + numDevices - 1).length;

  const results = [];
  for (let deviceIdx = 0; deviceIdx < numDevices; deviceIdx++) {
    // compute the starting MAC index for this device
    const macOffset = BigInt(requiredPerDevice) * BigInt(deviceIdx);
    const thisMacInt = baseMacInt + macOffset;
    const macHex = thisMacInt
      .toString(16)
      .toUpperCase()
      .padStart(macWidth, "0");

    // build PON-SN from prefix + last 8 hex chars
    const ponSn = startPonSnPrefix + macHex.slice(-8);

    // build HW-SN from prefix + sequential number per device
    const hwSeq = hwStart + deviceIdx;
    const hwSuffix = String(hwSeq).padStart(hwPadLen, "0");
    const hwSn = startHwSnPrefix + hwSuffix;
    let macKey;
    if (macIdRequired) {
      macKey = crypto.createHash("md5").update(macHex, "utf8").digest("hex");
    }

    // // MD5 hash for MAC-KEY
    // const macKey = crypto
    //   .createHash("md5")
    //   .update(macHex, "utf8")
    //   .digest("hex");

    results.push({ macId: macHex, ponSn, hwSn, macKey });
  }

  return res.json({ results });
};

const getGenerationResultsForSwitch = async (req, res) => {
  try {
    const { id } = req.params;

    // 1) Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid work-order ID" });
    }

    // 2) Load the work-order
    const gen = await MacGenerator.findById(id);
    if (!gen) {
      return res.status(404).json({ error: "Work-order not found" });
    }

    // 3) Ensure it's a SWITCH order
    if (gen.itemType !== "SWITCH") {
      return res
        .status(400)
        .json({ error: "This endpoint only supports SWITCH work-orders" });
    }

    // 4) Check required params
    const { startMacId, requiredPerDevice, itemQuantity } = gen;
    const missing = [];
    if (!startMacId) missing.push("startMacId");
    if (requiredPerDevice == null) missing.push("requiredPerDevice");
    if (itemQuantity == null) missing.push("itemQuantity");
    if (missing.length) {
      return res.status(400).json({
        error: "Missing required fields: " + missing.join(", "),
      });
    }

    // 5) Generate one MAC per device
    const baseMacInt = BigInt("0x" + startMacId);
    const macWidth = startMacId.length;
    const results = [];

    for (let deviceIdx = 0; deviceIdx < itemQuantity; deviceIdx++) {
      // compute offset = requiredPerDevice * deviceIdx
      const offset = BigInt(requiredPerDevice) * BigInt(deviceIdx);
      const thisMac = baseMacInt + offset;
      const macHex = thisMac.toString(16).toUpperCase().padStart(macWidth, "0");

      // MD5 of MAC for mac-key
      const macKey = crypto
        .createHash("md5")
        .update(macHex, "utf8")
        .digest("hex");

      results.push({ macId: macHex, macKey });
    }

    return res.json({ results });
  } catch (err) {
    console.error("Error generating switch results:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getGenerationResults = async (req, res) => {
  const { id } = req.params;

  try {
    // 1) Validate ID
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid work-order ID" });
    }

    // 2) Load the work-order
    const gen = await MacGenerator.findById(id);
    if (!gen) {
      return res.status(404).json({ error: "Work-order not found" });
    }

    // 3) ONT flow
    if (gen.itemType === "ONT") {
      console.log("ONT", gen.itemType);
      const {
        startMacId,
        requiredPerDevice,
        startHwSnPrefix,
        startHwSnSuffix = "",
        startPonSnPrefix,
        macIdRequired,
      } = gen;

      // validate we have what we need
      const missing = [];
      if (!startMacId) missing.push("startMacId");
      if (!requiredPerDevice) missing.push("requiredPerDevice");
      if (!startHwSnPrefix) missing.push("startHwSnPrefix");
      if (!startHwSnSuffix) missing.push("startHwSnSuffix");
      if (!startPonSnPrefix) missing.push("startPonSnPrefix");
      if (missing.length) {
        return res.status(400).json({
          error: "Missing generation parameters: " + missing.join(", "),
        });
      }

      const numDevices = gen.itemQuantity;
      const baseMacInt = BigInt("0x" + startMacId);
      const macWidth = startMacId.length;

      // figure out HW-SN padding
      const hwStart = parseInt(startHwSnSuffix, 10) || 0;
      // const hwPadLen =
      //   startHwSnSuffix.length || String(hwStart + numDevices - 1).length;

      const hwPadLen = startHwSnSuffix.length;

      const results = [];
      for (let deviceIdx = 0; deviceIdx < numDevices; deviceIdx++) {
        // compute the starting MAC index for this device
        const macOffset = BigInt(requiredPerDevice) * BigInt(deviceIdx);
        const thisMacInt = baseMacInt + macOffset;
        const macHex = thisMacInt
          .toString(16)
          .toUpperCase()
          .padStart(macWidth, "0");

        // build PON-SN from prefix + last 8 hex chars
        const ponSn = startPonSnPrefix + macHex.slice(-8);

        // build HW-SN from prefix + sequential number per device
        const hwSeq = hwStart + deviceIdx;
        const hwSuffix = String(hwSeq).padStart(hwPadLen, "0");
        const hwSn = startHwSnPrefix + hwSuffix;
        let macKey;
        if (macIdRequired) {
          macKey = crypto
            .createHash("md5")
            .update(macHex, "utf8")
            .digest("hex");
        }

        // // MD5 hash for MAC-KEY
        // const macKey = crypto
        //   .createHash("md5")
        //   .update(macHex, "utf8")
        //   .digest("hex");

        results.push({ macId: macHex, ponSn, hwSn, macKey });
      }

      return res.json({ results });
    }

    // 4) SWITCH flow
    if (gen.itemType === "SWITCH") {
      console.log("SWITCH", gen.itemType);
      // 4) Check required params
      const {
        startMacId,
        requiredPerDevice,
        itemQuantity,
        startHwSnPrefix,
        startHwSnSuffix = "",
      } = gen;

      const missing = [];
      if (!startMacId) missing.push("startMacId");
      if (requiredPerDevice == null) missing.push("requiredPerDevice");
      if (itemQuantity == null) missing.push("itemQuantity");
      if (!startHwSnPrefix) missing.push("startHwSnPrefix");
      if (startHwSnSuffix == null) missing.push("startHwSnSuffix");

      if (missing.length) {
        return res.status(400).json({
          error: "Missing required fields: " + missing.join(", "),
        });
      }

      // 5) Prepare for generation
      const baseMacInt = BigInt("0x" + startMacId);
      const macWidth = startMacId.length;
      const hwStart = parseInt(startHwSnSuffix, 10) || 0;
      // const padLen =
      //   startHwSnSuffix.length || String(hwStart + itemQuantity - 1).length;
      const padLen = startHwSnSuffix.length;

      const results = [];
      for (let deviceIdx = 0; deviceIdx < itemQuantity; deviceIdx++) {
        // compute which MAC belongs to this device
        const offset = BigInt(requiredPerDevice) * BigInt(deviceIdx);
        const thisMacInt = baseMacInt + offset;
        const macHex = thisMacInt
          .toString(16)
          .toUpperCase()
          .padStart(macWidth, "0");

        // generate HW-SN: prefix + incremented suffix
        const hwSeq = hwStart + deviceIdx;
        const suffix = String(hwSeq).padStart(padLen, "0");
        const hwSn = startHwSnPrefix + suffix;

        results.push({ macId: macHex, hwSn });
      }

      return res.json({ results });
    }

    // 5) Unknown itemType
    return res
      .status(400)
      .json({ error: `Unsupported itemType: ${gen.itemType}` });
  } catch (err) {
    console.error("getGenerationResults error:", err);
    // 6) Internal server error
    return res
      .status(500)
      .json({ error: "Internal Server Error", details: err.message });
  }
};

const searchMacGenerators = async (req, res) => {
  try {
    const {
      workOrderNumber,
      customerName,
      itemType,
      startMacId,
      date,
      page = "1",
      limit = "10",
    } = req.body;

    // 1) Validate itemType if provided
    if (itemType && !["ONT", "SWITCH"].includes(itemType)) {
      return res.status(400).json({
        error: "Invalid itemType; must be 'ONT' or 'SWITCH'",
      });
    }

    // 2) Build filter object
    const filter = {};
    if (workOrderNumber) filter.workOrderNumber = workOrderNumber;
    if (customerName) filter.customerName = new RegExp(customerName, "i");
    if (itemType) filter.itemType = itemType;
    if (startMacId) filter.startMacId = startMacId;

    // 3) Determine sort
    let sort = {};
    if (date === "latest") sort.createdAt = -1;
    else if (date === "oldest") sort.createdAt = 1;

    // 4) Parse & validate pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    if (isNaN(pageNum) || pageNum < 1 || isNaN(limitNum) || limitNum < 1) {
      return res.status(400).json({
        error:
          "Invalid pagination parameters; page & limit must be positive integers",
      });
    }
    const skip = (pageNum - 1) * limitNum;

    // 5) Execute query
    const [total, items] = await Promise.all([
      MacGenerator.countDocuments(filter),
      MacGenerator.find(filter).sort(sort).skip(skip).limit(limitNum),
    ]);

    // 6) Return paginated response
    return res.json({
      page: pageNum,
      limit: limitNum,
      total,
      pages: Math.ceil(total / limitNum),
      data: items,
    });
  } catch (err) {
    console.error("searchMacGenerators error:", err);
    return res.status(500).json({
      error: "Internal Server Error",
    });
  }
};

// const validateParametersToGenerate = async (req, res) => {
//   //input will be id of any workorder
//   //validate wheater excelFileGenerated is true or false.
//   //if excelFileGenerated :true :display msg that work-order is upto date.
//   //if excelFileGenerated :false then display msg :navigating to form component :Please update the work-order to generate excel file.
// };

const validateParametersToGenerate = async (req, res) => {
  const { id } = req.params;

  // 1) Validate ObjectId
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: "Invalid work-order ID" });
  }

  try {
    // 2) Load the work-order
    const gen = await MacGenerator.findById(id).lean();
    if (!gen) {
      return res.status(404).json({ error: "Work-order not found" });
    }

    // 3) Check the flag
    if (gen.excelFileGenerated) {
      return res.status(200).json({
        workOrderData: gen,
        upToDate: true,
        message: "Work-order is up to date.",
      });
    } else {
      return res.status(200).json({
        workOrderData: gen,
        upToDate: false,
        message:
          "Navigating to form component: Please update the work-order to generate excel file.",
      });
    }
  } catch (err) {
    console.error("validateParametersToGenerate error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
};

// const getGenerationResults = async (req, res) => {
//   const { id } = req.params;

//   try {
//     // 1) Validate work-order ID
//     if (!mongoose.Types.ObjectId.isValid(id)) {
//       return res.status(400).json({ error: "Invalid work-order ID" });
//     }

//     // 2) Load the work-order
//     const gen = await MacGenerator.findById(id);
//     if (!gen) {
//       return res.status(404).json({ error: "Work-order not found" });
//     }

//     // 3) Common param unpacking & validation
//     const {
//       startMacId,
//       requiredPerDevice,
//       itemQuantity,
//       startHwSnPrefix,
//       startHwSnSuffix = "",
//       startPonSnPrefix,
//       macIdRequired,
//     } = gen;

//     // Validate startMacId exists
//     if (!startMacId) {
//       return res
//         .status(400)
//         .json({ error: "Missing required field: startMacId" });
//     }
//     // Ensure it’s a hex string
//     if (!/^[0-9A-Fa-f]+$/.test(startMacId)) {
//       return res
//         .status(400)
//         .json({ error: "Invalid startMacId: must be hexadecimal" });
//     }

//     // Parse it safely
//     let baseMacInt;
//     try {
//       baseMacInt = BigInt("0x" + startMacId);
//     } catch (e) {
//       return res
//         .status(400)
//         .json({ error: "Invalid startMacId: cannot parse as BigInt" });
//     }

//     const macWidth = startMacId.length;

//     // 4) ONT flow
//     if (gen.itemType === "ONT") {
//       // Check all ONT params
//       const missing = [];
//       if (requiredPerDevice == null)    missing.push("requiredPerDevice");
//       if (!startHwSnPrefix)             missing.push("startHwSnPrefix");
//       if (!startHwSnSuffix)             missing.push("startHwSnSuffix");
//       if (!startPonSnPrefix)            missing.push("startPonSnPrefix");
//       if (missing.length) {
//         return res
//           .status(400)
//           .json({ error: "Missing fields: " + missing.join(", ") });
//       }

//       const numDevices = itemQuantity;
//       const hwStart    = parseInt(startHwSnSuffix, 10) || 0;
//       const hwPadLen   =
//         startHwSnSuffix.length ||
//         String(hwStart + numDevices - 1).length;

//       const results = [];
//       for (let i = 0; i < numDevices; i++) {
//         const macOffset = BigInt(requiredPerDevice) * BigInt(i);
//         const thisMac   = baseMacInt + macOffset;
//         const macHex    = thisMac
//           .toString(16)
//           .toUpperCase()
//           .padStart(macWidth, "0");

//         const ponSn = startPonSnPrefix + macHex.slice(-8);

//         const hwSeq    = hwStart + i;
//         const hwSuffix = String(hwSeq).padStart(hwPadLen, "0");
//         const hwSn     = startHwSnPrefix + hwSuffix;

//         const entry = { macId: macHex, ponSn, hwSn };
//         if (macIdRequired) {
//           entry.macKey = crypto
//             .createHash("md5")
//             .update(macHex, "utf8")
//             .digest("hex");
//         }

//         results.push(entry);
//       }

//       return res.json({ results });
//     }

//     // 5) SWITCH flow
//     if (gen.itemType === "SWITCH") {
//       // Check SWITCH params
//       const missing = [];
//       if (requiredPerDevice == null) missing.push("requiredPerDevice");
//       if (itemQuantity == null)      missing.push("itemQuantity");
//       if (!startHwSnPrefix)          missing.push("startHwSnPrefix");
//       if (startHwSnSuffix == null)   missing.push("startHwSnSuffix");
//       if (missing.length) {
//         return res
//           .status(400)
//           .json({ error: "Missing fields: " + missing.join(", ") });
//       }

//       const hwStart  = parseInt(startHwSnSuffix, 10) || 0;
//       const padLen   =
//         startHwSnSuffix.length ||
//         String(hwStart + itemQuantity - 1).length;

//       const results = [];
//       for (let i = 0; i < itemQuantity; i++) {
//         const macOffset = BigInt(requiredPerDevice) * BigInt(i);
//         const thisMac   = baseMacInt + macOffset;
//         const macHex    = thisMac
//           .toString(16)
//           .toUpperCase()
//           .padStart(macWidth, "0");

//         const hwSeq    = hwStart + i;
//         const hwSuffix = String(hwSeq).padStart(padLen, "0");
//         const hwSn     = startHwSnPrefix + hwSuffix;

//         results.push({ macId: macHex, hwSn });
//       }

//       return res.json({ results });
//     }

//     // 6) Unknown itemType
//     return res
//       .status(400)
//       .json({ error: `Unsupported itemType: ${gen.itemType}` });

//   } catch (err) {
//     console.error("getGenerationResults error:", err);
//     return res
//       .status(500)
//       .json({ error: "Internal Server Error", details: err.message });
//   }
// };

export {
  registerMacGenerator,
  generateParameters,
  getGenerationResultsForONT,
  getGenerationResultsForSwitch,
  getGenerationResults,
  searchMacGenerators,
  validateParametersToGenerate,
};
