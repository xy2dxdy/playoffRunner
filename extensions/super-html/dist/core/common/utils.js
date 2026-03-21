"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (Object.hasOwnProperty.call(mod, k)) result[k] = mod[k];
    result["default"] = mod;
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
const json_js_1 = __importDefault(require("../config/json.js"));
const config_1 = __importDefault(require("../config/config"));
const uglify = __importStar(require("uglify-js"));
const js_obfuscator = require("./javascript-obfuscator.js");
const s_prefix = config_1.default.constants.package_name + " : ";
class utils {
    debug(...p) {
        if (!config_1.default.is_debug) {
            return;
        }
        this.log(...p);
    }
    log(...p) {
        //@ts-ignore
        if (global["Editor"] && Editor.log) {
            //@ts-ignore
            Editor.log(s_prefix, ...p);
        }
        else {
            console.log(s_prefix, ...p);
        }
    }
    warn(...p) {
        //@ts-ignore
        if (global["Editor"] && Editor.warn) {
            //@ts-ignore
            Editor.warn(s_prefix, ...p);
        }
        else {
            console.warn(s_prefix, ...p);
        }
    }
    error(...p) {
        //@ts-ignore
        if (global["Editor"] && Editor.error) {
            //@ts-ignore
            Editor.error(s_prefix, ...p);
        }
        else {
            console.error(s_prefix, ...p);
        }
    }
    // #### 
    /** 对字符去重 */
    str_unique(str) {
        return [...new Set(str)].sort(function (a, b) { return a.charCodeAt(0) - b.charCodeAt(0); }).join("");
    }
    /** 正则过滤字符串的注释 */
    str_filter_notes(str) {
        return str.replace(/\/\*(.|[\r\n])*?\*\//g, "").replace(/\/\/.*/g, "");
    }
    /** 获得字符串大小 kb */
    str_kb_size(str) {
        return this.b_to_kb(str.length);
    }
    b_to_kb(len) {
        return (len / 1024).toFixed(0) + " kb";
    }
    convert_path(s_path) {
        return s_path.replace(/\\/g, "/");
    }
    min_script(js) {
        return js = uglify.minify(js, {}).code;
    }
    get_json(s_key) {
        //@ts-ignore
        return json_js_1.default[s_key];
    }
    // 混淆
    obfuscate(s_content) {
        const result = js_obfuscator.obfuscate(s_content, {
            compact: true,
            controlFlowFlattening: false,
            deadCodeInjection: false,
            debugProtection: false,
            debugProtectionInterval: false,
            // debugProtectionInterval: 0,
            disableConsoleOutput: false,
            identifierNamesGenerator: 'mangled',
            log: false,
            numbersToExpressions: false,
            renameGlobals: false,
            /** 保留标识符，让其不被混淆，支持正则表达式。 */
            reservedNames: [],
            rotateStringArray: true,
            selfDefending: false,
            shuffleStringArray: true,
            simplify: true,
            splitStrings: false,
            stringArray: true,
            stringArrayEncoding: [],
            stringArrayIndexShift: true,
            stringArrayWrappersCount: 1,
            stringArrayWrappersChainedCalls: true,
            stringArrayWrappersParametersMaxCount: 2,
            stringArrayWrappersType: 'variable',
            stringArrayThreshold: 0.75,
            unicodeEscapeSequence: false
        });
        return result.getObfuscatedCode();
    }
}
;
exports.default = new utils();
