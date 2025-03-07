import OsuApiService from './IntermediateOsuApiService';
import DomHelper from "./DomHelper";
import log from "/logger";

const OsuApi = new OsuApiService;

//TODO: Оптимизировать обращения к DOM

class MoreBeatmapInfo {
    constructor(observer) {
        this.domObserver = observer;
    }

    initialize() {
        DomHelper.catchBeatmapsFromDOM()
            .then(beatmapsRows => {
                log('Attempting to call function setLastDiffInfoToMapsRows', 'dev');
                if (beatmapsRows) {
                    this.setLastDiffInfoToBeatmapsRows(beatmapsRows);
                }
                this.domObserver.startObserving(
                    '.beatmapsets__items',
                    (addedNodes) => this.setLastDiffInfoToBeatmapsRows(addedNodes),
                    {childList: true, subtree: false}
                );

                this.domObserver.observeDynamicElement(
                    '.beatmaps-popup__group',
                    (dynamicElement) => this.processPopupGroupChanges(dynamicElement)
                );
            })
            .catch(error => {
                log(`Failed to catch beatmaps from DOM: ${error}`, 'prod', 'error');
            });
    }

    processPopupGroupChanges(beatmapDiffsGroup) {
        log(beatmapDiffsGroup, 'dev');
        DomHelper.addChangeInfoButtonsToMapsetDiffsList(beatmapDiffsGroup, (beatmapId) => {
            this.handleChangeInfoDiffClick(beatmapId);
        });
    }

    setLastDiffInfoToBeatmapsRows(beatmapsBlocksRows) {
        const beatmapsBlocks = this.flattenBeatmapRows(beatmapsBlocksRows);
        beatmapsBlocks.map((beatmapBlock) => {
            this.setInfoToBeatmapBlock(beatmapBlock);
        });
    }

    async setInfoToBeatmapBlock(beatmapBlock) {
        try {
            const mapsetId = DomHelper.getMapsetIdFromBlock(beatmapBlock);
            const mapsetData = await OsuApi.getMapsetData(mapsetId);
            const lastDiffData = this.getLastMapsetDiffInfo(mapsetData);

            this.updateBeatmapBlock(beatmapBlock, mapsetId, lastDiffData);
        } catch (error) {
            log(`Failed to process beatmapBlock: ${error}`, 'prod', 'error');
        }
    }

    updateBeatmapBlock(beatmapBlock, mapsetId, beatmapData) {
        if (!beatmapData) {
            return this.handleMissingBeatmapData(beatmapBlock, mapsetId);
        }

        beatmapBlock.setAttribute('mapsetId', mapsetId);
        beatmapBlock.setAttribute('beatmapId', beatmapData.id);
        const mapDiffInfoString = this.createBeatmapParamsAsString(beatmapData);

        DomHelper.mountBeatmapInfoToBlock(beatmapBlock, mapsetId, mapDiffInfoString);
        if (beatmapData.mode === 'osu') {
            DomHelper.addDeepInfoButtonToBeatmap(beatmapBlock, (block) => this.handleDeepInfoBtnClick(block));
        }
        this.setBeatmapPPReceivingToBlock(beatmapBlock, beatmapData.id);
    }

    handleMissingBeatmapData(beatmapBlock, mapsetId) {
        beatmapBlock.setAttribute('mapsetId', mapsetId);
        const failedInfoBlock = document.createElement('div');
        failedInfoBlock.textContent = 'Failed to get beatmap data';
        const retryGetInfoBtn = DomHelper.createRetryGetInfoBtn();
        failedInfoBlock.appendChild(retryGetInfoBtn);

        DomHelper.mountBeatmapInfoToBlock(beatmapBlock, mapsetId, failedInfoBlock);

        retryGetInfoBtn.addEventListener('click', async () => {
            try {
                await this.setInfoToBeatmapBlock(beatmapBlock);
                failedInfoBlock.remove();
            } catch (error) {
                log(`Error processing beatmap block: ${error}`, 'dev', 'error');
            }
        });
    }

    async handleDeepInfoBtnClick(beatmapBlock) {
        log(`Handling deep info button for block: ${beatmapBlock}`, 'debug');
        const beatmapId = beatmapBlock.getAttribute('beatmapId');
        log(`Deep beatmapData initialized for: ${beatmapId}`, 'debug');
        const existingDeepInfoTooltip = DomHelper.getExistingDeepInfoTooltip(beatmapId);
        if (existingDeepInfoTooltip) {
            existingDeepInfoTooltip.remove();
        } else {
            try {
                const beatmapCalcData = await OsuApi.getCalculatedBeatmapData(beatmapId);
                DomHelper.mountPPForBeatmapBlock(beatmapBlock, beatmapCalcData.pp);
                log(beatmapCalcData, 'debug');
                const deepBeatmapDataAsString = this.createBeatmapDifficultyParamsString(beatmapCalcData.difficulty);
                DomHelper.displayTooltip(deepBeatmapDataAsString, beatmapId, beatmapBlock);
            } catch (error) {
                log(`Error fetching beatmap data: ${error.message}`, 'dev', 'error');
            }
        }
    }

    setBeatmapPPReceivingToBlock(beatmapBlock, beatmapId) {
        const beatmapPPBlock = beatmapBlock.querySelector('.pp-block');
        if (!beatmapPPBlock) {
            const beatmapNameBlock = beatmapBlock.querySelector('.beatmapset-panel__info').firstElementChild;
            beatmapNameBlock.innerHTML += `<div class="pp-block"></div>`;
        }

        const cachedBeatmapPP = OsuApi.getCalculatedBeatmapDataFromCache(beatmapId);
        if (cachedBeatmapPP) {
            DomHelper.mountPPForBeatmapBlock(beatmapBlock, cachedBeatmapPP.pp);
        } else {
            DomHelper.mountPPButton(beatmapBlock, (beatmapBlock) => {
                this.handleGetPPBtnClick(beatmapBlock, beatmapId);
            });
        }
    }

    async handleGetPPBtnClick(beatmapBlock, beatmapId) {
        const beatmapPP = await OsuApi.getCalculatedBeatmapData(beatmapId);
        DomHelper.mountPPForBeatmapBlock(beatmapBlock, beatmapPP.pp);
    }

    createBeatmapDifficultyParamsString(beatmapData) {
        console.log(beatmapData);
        const {
            aim, speed, nCircles, nSliders, speedNoteCount, flashlight
        } = beatmapData;

        return [
            `Aim diff: ${aim.toFixed(1)}`,
            `Speed diff: ${speed.toFixed(1)}`,
            `Circles: ${nCircles}`,
            `Sliders: ${nSliders}`,
            `Speed note count: ${speedNoteCount.toFixed(1)}`,
            `FL Diff: ${flashlight.toFixed(2)}`,
        ].join(', ');
    }

    flattenBeatmapRows(beatmapsBlocksRows) {
        log(beatmapsBlocksRows, 'debug');
        return Array.from(beatmapsBlocksRows)
            .flatMap(row => Array.from(row.querySelectorAll('.beatmapsets__item')))
            .flat();
    }

    createBeatmapParamsAsString(beatmapData) {
        return `<div class="more-beatmap-info">
        ${beatmapData.difficulty_rating}★
        bpm ${beatmapData.bpm}
        combo ${beatmapData.max_combo}
        ar ${beatmapData.ar}
        cs ${beatmapData.cs}
        od ${beatmapData.accuracy}
        hp ${beatmapData.drain}`;
    }

    getLastMapsetDiffInfo(mapsetData) {
        if (!mapsetData || !mapsetData.beatmaps || mapsetData.beatmaps.length === 0) {
            return null;
        }

        return mapsetData.beatmaps.reduce((maxDiff, currentMap) => {
            return currentMap.difficulty_rating > maxDiff.difficulty_rating ? currentMap : maxDiff;
        }, mapsetData.beatmaps[0]);
    }

    /**
     * Handles the click to change diff info for a given beatmapId, in beatmap card in DOM.
     * Converts and validates the `beatmapId`, retrieves the diff info from cache,
     * and updates the display or reloads the extension if not found. For example, if cache was cleaned.
     *
     * @param beatmapId {string|int}
     * @returns {void}
     */

    handleChangeInfoDiffClick(beatmapId) {
        if (this.isBeatmapInfoAlreadyDisplayed(beatmapId)) return;

        const numericBeatmapId = this.convertToNumericBeatmapId(beatmapId);
        const beatmapInfo = OsuApi.getDiffInfoByIdFromCache(numericBeatmapId);
        if (!beatmapInfo) {
            this.handleMissingBeatmapInfo(numericBeatmapId);
            return;
        }
        const beatmapBlock = DomHelper.getMapsetBlockById(beatmapInfo.mapsetId);
        this.updateBeatmapInfoDOM(beatmapInfo.map, beatmapBlock);
        this.setBeatmapPPReceivingToBlock(beatmapBlock, beatmapId);
        DomHelper.updateBeatmapIdBtn(beatmapId, beatmapInfo.mapsetId);
    }

    // async updatePPBlockForNewBeatmapId(mapsetId, beatmapId) {
    //     console.log(`updating PP for beatmap set: ${mapsetId} to beatmap: ${beatmapId}`);
    //     const beatmapBlock = DomHelper.getMapsetBlockById(mapsetId);
    //     const beatmapPP = await OsuApi.getCalculatedBeatmapData(beatmapId);
    //     DomHelper.mountPPForBeatmapBlock(beatmapBlock, beatmapPP);
    // }

    convertToNumericBeatmapId(beatmapId) {
        const numericBeatmapId = parseInt(beatmapId, 10);
        if (isNaN(numericBeatmapId)) {
            log(`Invalid beatmapId: ${beatmapId}`, 'dev', 'error');
        }
        return numericBeatmapId;
    }

    isBeatmapInfoAlreadyDisplayed(beatmapId) {
        const mapsetBlock = DomHelper.getMapsetBlockByCurrentDiffDisplayed(beatmapId);
        if (mapsetBlock) {
            log('A block already contains current info', 'dev');
            return true;
        }
        return false;
    }

    handleMissingBeatmapInfo(numericBeatmapId) {
        log('Beatmap info not found, reloading extension...', 'dev');
        this.reloadExtensionEvent();

        setTimeout(() => {
            const retryBeatmapInfo = OsuApi.getDiffInfoByIdFromCache(numericBeatmapId);
            if (retryBeatmapInfo) {
                log(retryBeatmapInfo, 'debug');
                const beatmapBlock = DomHelper.getMapsetBlockById(retryBeatmapInfo.mapsetId);
                this.updateBeatmapInfoDOM(retryBeatmapInfo.map, beatmapBlock);
                DomHelper.updateBeatmapIdBtn(numericBeatmapId, retryBeatmapInfo.mapsetId);
            } else {
                log('Unable to fetch beatmap info after reload in 1.3 sec\nProbably bad internet connection',
                    'dev', 'error');
            }
        }, 1300);
    }

    updateBeatmapInfoDOM(beatmapInfo, beatmapBlock) {
        const diffInfoBlock = beatmapBlock.querySelector('.more-beatmap-info-block');
        const diffInfoString = this.createBeatmapParamsAsString(beatmapInfo);
        log(diffInfoBlock, 'debug');
        if (diffInfoBlock) {
            diffInfoBlock.innerHTML = diffInfoString;
        }
    }

    reloadExtensionEvent() {
        const event = new CustomEvent('reloadExtensionRequested');
        window.dispatchEvent(event);
    }
}

export default MoreBeatmapInfo;
