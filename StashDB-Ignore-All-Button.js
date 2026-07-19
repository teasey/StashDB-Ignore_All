// ==UserScript==
// @name         StashDB - Ignore all Scenes
// @namespace    https://github.com/7dJx1qP/stashdb-userscripts
// @version      1.0.2
// @description  Adds an Ignore all Scenes button next to the scene filter.
// @match        https://stashdb.org/*
// @grant        GM.getValue
// @grant        GM.setValue
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const BUTTON_ID = 'stashdb-ignore-all-scenes';
    const DEFAULT_STATE = '{"ignored":false,"wanted":false}';
    let isSaving = false;
    let placementObserver;
    let placementTimeout;

    function getSceneCards() {
        return [...document.querySelectorAll('.SceneCard')];
    }

    function getStashId(card) {
        const link = card.querySelector('.card-footer a[href*="/scenes/"]')
            || card.querySelector('a[href*="/scenes/"]');
        if (!link) return null;

        const match = new URL(link.href, location.origin).pathname.match(/^\/scenes\/([^/]+)$/);
        return match ? match[1] : null;
    }

    async function getSceneState(stashId) {
        try {
            return JSON.parse(await GM.getValue(stashId, DEFAULT_STATE));
        } catch (_) {
            return JSON.parse(DEFAULT_STATE);
        }
    }

    async function existsInLocalStash(card, stashId) {
        // The bundle may already have determined this while rendering the card.
        if (card.querySelector('.stash_id_match.match-yes')) return true;

        try {
            const result = await unsafeWindow.stashdb.stashdb.findSceneByStashId(stashId);
            return result?.data?.findScenes?.count > 0;
        } catch (error) {
            console.warn('[StashDB Ignore all Scenes] Local scene lookup failed.', error);
            return false;
        }
    }

    async function ignoreAll(button) {
        if (isSaving) return;

        const scenes = getSceneCards()
            .map(card => ({ card, stashId: getStashId(card) }))
            .filter(scene => scene.stashId);
        if (!scenes.length) return;

        isSaving = true;
        button.disabled = true;
        const defaultLabel = 'Ignore all Scenes';
        button.textContent = `Checking ${scenes.length} scenes...`;

        let completed = 0;
        try {
            const eligibleScenes = (await Promise.all(scenes.map(async ({ card, stashId }) => {
                const state = await getSceneState(stashId);
                if (state.wanted === true || state.ignored === true) return null;
                if (await existsInLocalStash(card, stashId)) return null;
                return { card, stashId, state };
            }))).filter(Boolean);

            if (!eligibleScenes.length) {
                button.textContent = 'No eligible scenes found';
                return;
            }

            button.textContent = `Ignoring 0/${eligibleScenes.length}...`;
            await Promise.all(eligibleScenes.map(async ({ card, stashId, state }) => {

                state.ignored = true;
                await GM.setValue(stashId, JSON.stringify(state));
                card.classList.add('stash_id_ignored');

                completed += 1;
                button.textContent = `Ignoring ${completed}/${eligibleScenes.length}...`;
            }));
            button.textContent = `Ignored ${eligibleScenes.length} scene${eligibleScenes.length === 1 ? '' : 's'}`;
        } catch (error) {
            console.error('[StashDB Ignore all Scenes]', error);
            button.textContent = 'Could not ignore all scenes';
        } finally {
            isSaving = false;
            window.setTimeout(() => {
                button.disabled = false;
                button.textContent = defaultLabel;
            }, 1800);
        }
    }

    function placeButton() {
        const filter = document.querySelector('.visible-filter');
        if (!filter || !document.querySelector('.SceneCard')) return false;

        let button = document.getElementById(BUTTON_ID);
        if (!button) {
            button = document.createElement('button');
            button.id = BUTTON_ID;
            button.type = 'button';
            button.className = 'btn btn-outline-danger';
            button.textContent = 'Ignore all Scenes';
            button.title = 'Mark every currently displayed scene as ignored';
            button.addEventListener('click', () => ignoreAll(button));
        }

        // Keep the select and button on one row, independent of the page grid.
        filter.style.display = 'inline-flex';
        filter.style.alignItems = 'center';
        filter.style.gap = '0.5rem';
        if (button.parentElement !== filter) filter.appendChild(button);
        return true;
    }

    function stopPlacementObserver() {
        placementObserver?.disconnect();
        placementObserver = undefined;
        window.clearTimeout(placementTimeout);
        placementTimeout = undefined;
    }

    function waitForFilter() {
        stopPlacementObserver();
        if (placeButton()) return;

        placementObserver = new MutationObserver(() => {
            if (placeButton()) stopPlacementObserver();
        });
        placementObserver.observe(document.documentElement, { childList: true, subtree: true });
        placementTimeout = window.setTimeout(stopPlacementObserver, 5000);
    }

    function start() {
        waitForFilter();
        // The bundle is intentionally assumed to be installed.
        unsafeWindow.stashdb.addEventListener('page', () => window.setTimeout(waitForFilter, 0));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
