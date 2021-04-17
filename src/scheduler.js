"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Scheduler = void 0;
const cron_1 = require("cron");
const oneKvData_1 = require("./oneKvData");
const KUSAMA_DECIMAL = 1000000000000;
class Scheduler {
    constructor(chainData, db, cacheData) {
        this.chainData = chainData;
        this.cacheData = cacheData;
        this.db = db;
        this.isCaching = false;
        this.oneKvHandler = new oneKvData_1.OneKvHandler(this.chainData, this.cacheData, this.db);
    }
    start() {
        const job = new cron_1.CronJob('30 */1 * * *', () => __awaiter(this, void 0, void 0, function* () {
            if (this.isCaching) {
                return;
            }
            this.isCaching = true;
            try {
                console.log('Kusama scheduler starts');
                yield this.updateActiveEra();
                const activeEra = yield this.chainData.getActiveEraIndex();
                const eraReward = yield this.chainData.getEraTotalReward(activeEra - 1);
                console.log('era reward: ' + eraReward);
                const validatorWaitingInfo = yield this.chainData.getValidatorWaitingInfo();
                console.log('Write to database');
                for (let i = 0; i < validatorWaitingInfo.validators.length; i++) {
                    const validator = validatorWaitingInfo.validators[i];
                    if (validator !== undefined && eraReward !== undefined) {
                        const eraValidatorCount = validatorWaitingInfo.validators.length;
                        this.makeValidatorInfoOfEra(validator, eraReward, activeEra, 900);
                    }
                }
                this.cacheData.update('validDetailAll', {
                    valid: validatorWaitingInfo.validators.map(v => {
                        if (v !== undefined) {
                            return v.exportString();
                        }
                    })
                });
                const nominators = yield this.chainData.getNominators();
                this.cacheData.update('nominators', nominators.map((n) => {
                    return n === null || n === void 0 ? void 0 : n.exportString();
                }));
                console.log('length ' + validatorWaitingInfo.validators.length);
                yield this.cacheOneKVInfo(validatorWaitingInfo.validators);
                console.log('Kusama scheduler ends');
            }
            catch (err) {
                console.log(err);
                console.log('schedule retrieving data error');
            }
            this.isCaching = false;
        }), null, true, 'America/Los_Angeles', null, true);
        job.start();
    }
    cacheOneKVInfo(validators) {
        return __awaiter(this, void 0, void 0, function* () {
            const oneKvSummary = yield this.oneKvHandler.getValidValidators(validators);
            this.cacheData.update('onekv', oneKvSummary.toJSON());
            const oneKvNominators = yield this.oneKvHandler.getOneKvNominators();
            this.cacheData.update('oneKvNominators', oneKvNominators);
        });
    }
    updateActiveEra() {
        return __awaiter(this, void 0, void 0, function* () {
            const era = yield this.chainData.getActiveEraIndex();
            yield this.db.saveActiveEra(era);
        });
    }
    makeValidatorInfoOfEra(validator, eraReward, era, validatorCount) {
        return __awaiter(this, void 0, void 0, function* () {
            const stakerPoint = yield this.chainData.getStakerPoints(validator.accountId);
            const activeEras = stakerPoint === null || stakerPoint === void 0 ? void 0 : stakerPoint.filter((point) => {
                return point.points.toNumber() > 0;
            });
            // console.log('---------------');
            // console.log(validator.accountId);
            // console.log('stakerpoints: ' + stakerPoint?.map((point)=>{
            //   return point.era.toNumber();
            // }));
            // console.log('active eras: ' + activeEras?.map((era)=>{
            //   return era.era.toNumber();
            // }));
            // console.log('claimed eras: ' + validator.stakingLedger.claimedRewards.map((era)=>{
            //   return era.toNumber();
            // }));
            const unclaimedEras = activeEras === null || activeEras === void 0 ? void 0 : activeEras.filter((point) => !validator.stakingLedger.claimedRewards.includes(point.era));
            // console.log('unclaimed eras: ' + unclaimedEras?.map((era)=>{
            //   return era.era.toNumber();
            // }));
            const lastEraInfo = yield this.db.getValidatorStatusOfEra(validator === null || validator === void 0 ? void 0 : validator.accountId, era - 1);
            let latestCommission = 0;
            if (lastEraInfo !== undefined) {
                if (lastEraInfo.validator !== undefined && lastEraInfo.validator !== null) {
                    if (lastEraInfo.validator.info !== undefined) {
                        latestCommission = lastEraInfo.validator.info[0].commission;
                    }
                }
            }
            let commissionChanged = 0;
            if (latestCommission != validator.prefs.commissionPct()) {
                console.log(latestCommission, validator.prefs.commissionPct());
                if (validator.prefs.commissionPct() > latestCommission) {
                    console.log('commission up');
                    commissionChanged = 1;
                }
                else if (validator.prefs.commissionPct() < latestCommission) {
                    console.log('commission down');
                    commissionChanged = 2;
                }
                else {
                    commissionChanged = 0;
                }
            }
            const apy = validator.apy(BigInt(KUSAMA_DECIMAL), BigInt(eraReward), validatorCount);
            const data = {
                era: era,
                exposure: validator.exposure,
                commission: validator.prefs.commissionPct(),
                apy: apy,
                identity: validator.identity,
                nominators: validator.nominators,
                commissionChanged: commissionChanged,
            };
            yield this.db.saveValidatorUnclaimedEras(validator.accountId, unclaimedEras === null || unclaimedEras === void 0 ? void 0 : unclaimedEras.map((era) => {
                return era.era.toNumber();
            }));
            yield this.db.saveValidatorNominationData(validator.accountId, data);
        });
    }
}
exports.Scheduler = Scheduler;
