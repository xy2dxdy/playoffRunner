"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const config_1 = __importDefault(require("./config/config"));
const utils_1 = __importDefault(require("./common/utils"));
const res_handler_1 = __importDefault(require("./handler/res_handler"));
const channel_handler_1 = __importDefault(require("./handler/channel_handler"));
class build {
    constructor(s_version, s_input_dir, s_out_dir, cb) {
        this.s_version = s_version;
        this.s_input_dir = s_input_dir;
        this.s_out_dir = s_out_dir;
        this.cb = cb;
        utils_1.default.log("-- start --");
        utils_1.default.log("engine version " + s_version);
        let version = "24x";
        if (s_version.search(/3.[0-9].[0-9]/) == 0) {
            if (s_version.search(/3.[0-3]/) == 0) {
                throw Error(`This engine version is not supported. Please contact the developer`);
            }
            version = "34x";
        }
        else if (s_version.search(/2.4.[0-9]/) == 0) {
            version = "24x";
        }
        else {
            throw Error(`This engine version is not supported. Please contact the developer`);
        }
        config_1.default.version = version;
        //对路径进行处理，防止出现奇奇怪怪的
        config_1.default.s_input_dir = s_input_dir.replace(/\\/g, "/").replace("./", "");
        config_1.default.s_out_dir = s_out_dir.replace(/\\/g, "/").replace("./", "");
        config_1.default.d_hot = new class {
            constructor() {
                // html基础的数据
                this.s_base_html_content = "";
                // 过滤的文件
                this.set_filter_file = new Set();
                //资源缓存(全部不压缩可使用这一份)
                this.d_res_cache = {};
                //资源压缩率
                this.d_res_zip_ratio = {};
                //以下两份在输出zip的时候都要输出
                //不压缩的资源
                this.d_out_res_no_zip = {};
                //压缩并且转成base64的输出资源
                this.s_out_res_zip_base64 = "";
                // 需要提前依赖的脚本名
                this.l_pre_load_script = [];
                // 需要额外注入到 html 中（一般是为了通过机器扫描）
                this.s_unity_inject_html = "";
            }
        };
        this.build();
    }
    async build() {
        let i_time = new Date().getTime();
        await this.run();
        utils_1.default.log(`run time ${(new Date().getTime() - i_time) / 1000}S`);
        utils_1.default.log("-- end -- ");
        this.cb && this.cb();
    }
    async run() {
        return new Promise(async (resolve, reject) => {
            //读取生成基础html
            await res_handler_1.default.create_html();
            // 读取生成资源缓存
            await res_handler_1.default.create_res_cache();
            // 计算压缩率
            await res_handler_1.default.call_zip_ratio();
            // 生成资源
            await res_handler_1.default.build_res();
            // 生成各渠道文件
            await channel_handler_1.default.run();
            resolve({});
        }).catch((err) => {
            utils_1.default.error(err, err.message);
            throw err;
        });
    }
}
exports.default = build;
