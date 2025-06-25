// models/MacGenerator.js
import mongoose, { Schema } from "mongoose";

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

const macGeneratorSchema = new Schema(
  {
    // now required, because we set it explicitly in the controller
    workOrderNumber: { type: String, unique: true, required: true },
    orderSequence: { type: Number, unique: true, required: true },

    customerName: { type: String, required: true },
    customerPo: { type: String, required: true },
    customerPoDate: { type: Date, required: true },
    itemType: {
      type: String,
      required: true,
      enum: ["ONT", "SWITCH"],
    },
    customerModel: { type: String, required: true },
    oemModel: { type: String, required: true },
    odmModel: { type: String, required: true },
    itemQuantity: { type: Number, required: true },

    // optional generation params
    startMacId: String,
    requiredPerDevice: Number,
    startHwSnPrefix: { type: String, minlength: 2, maxlength: 6 },
    startHwSnSuffix: String,
    startPonSnPrefix: { type: String, minlength: 2, maxlength: 6 },
    startPonSnSuffix: String,
    startMacKey: String,
    macIdRequired: { type: Boolean, required: true, default: false },
    excelFileGenerated: {
      type: Boolean,
      default: false,
    },

    macVendorName: String,
  },
  {
    timestamps: true,
  }
);

export const MacGenerator = mongoose.model("MacGenerator", macGeneratorSchema);

// /*
// 0
// 1
// 2
// 3
// 4
// 5
// 6
// 7
// 8
// 9
// 10-A
// 11-B
// 12-C
// 13-D
// 14-E
// 15-F
// */

// /*
// 67D-1
// 67E-2
// 67F-3
// 680-4
// 681-5
// 682-6
// 683-7
// 684-8
// 685-9
// 686-10
// 687-11
// 689-12
// 68A-13
// 68B-14
// 68C-15
// 68D-16
// 68E
// 68F
// 690
// */
