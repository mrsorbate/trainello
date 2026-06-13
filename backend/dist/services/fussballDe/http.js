"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createHttpClient = void 0;
const axios_1 = __importDefault(require("axios"));
const createHttpClient = (timeoutMs = 10000) => {
    return axios_1.default.create({
        timeout: timeoutMs,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
    });
};
exports.createHttpClient = createHttpClient;
//# sourceMappingURL=http.js.map