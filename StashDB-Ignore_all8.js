// ==UserScript==
// @name         StashDB – Ignore all Scenes
// @namespace    https://github.com/7dJx1qP/stashdb-userscripts
// @version      1.0.0
// @description  Adds an "Ignore all Scenes" button and marks every visible StashDB scene card as ignored.
// @author       Jan
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
    let placementPending = false;

    function sceneCards() {
        return [...document.querySelectorAll('.SceneCard')];
    }

    function stashIdFromCard(card) {
        // This is the same link the original library uses on list cards.
        const link = card.querySelector('.card-footer a[href*="/scenes/"]')
            || card.querySelector('a[href*="/scenes/"]');
        if (!link) return null;

        try {
            const match = new URL(link.href, location.origin).pathname.match(/^\/scenes\/([^/]+)$/);
            return match ? match[1] : null;
        } catch (_) {
            return null;
        }
    }

    async function ignoreAll(button) {
        if (isSaving) return;

        const targets = sceneCards()
            .map(card => ({ card, stashId: stashIdFromCard(card) }))
            .filter(({ stashId }) => stashId);

        if (!targets.length) return;

        isSaving = true;
        button.disabled = true;
        const originalLabel = button.textContent;
        button.textContent = `Ignoring 0/${targets.length}…`;

        let completed = 0;
        try {
            await Promise.all(targets.map(async ({ card, stashId }) => {
                let sceneState;
                try {
                    sceneState = JSON.parse(await GM.getValue(stashId, DEFAULT_STATE));
                } catch (_) {
                    // Keep the original scripts' default state if an old value is malformed.
                    sceneState = JSON.parse(DEFAULT_STATE);
                }

                sceneState.ignored = true;
                await GM.setValue(stashId, JSON.stringify(sceneState));
                card.classList.add('stash_id_ignored');

                completed += 1;
                button.textContent = `Ignoring ${completed}/${targets.length}…`;
            }));
            button.textContent = `Ignored ${targets.length} scene${targets.length === 1 ? '' : 's'}`;
        } catch (error) {
            console.error('[StashDB Ignore all Scenes]', error);
            button.textContent = 'Could not ignore all scenes';
        } finally {
            isSaving = false;
            window.setTimeout(() => {
                button.disabled = false;
                button.textContent = originalLabel;
            }, 1800);
        }
    }

    function addButton() {
        const visibleFilter = document.querySelector('.visible-filter');
        if (!visibleFilter || !document.querySelector('.SceneCard')) return false;

        let button = document.getElementById(BUTTON_ID);
        if (!button) {
            button = document.createElement('button');
            button.id = BUTTON_ID;
            button.type = 'button';
            button.className = 'btn btn-outline-danger';
            button.textContent = 'Ignore all Scenes';
            button.title = 'Mark every scene currently shown on this page as ignored';
            button.addEventListener('click', () => ignoreAll(button));
        }

        // Avoid moving an already correctly placed button: moving it creates a
        // DOM mutation, which previously caused an observer feedback loop.
        if (visibleFilter.nextElementSibling !== button) {
            visibleFilter.insertAdjacentElement('afterend', button);
        }
        return true;
    }

    function stopPlacementObserver() {
        placementObserver?.disconnect();
        placementObserver = undefined;
        window.clearTimeout(placementTimeout);
        placementTimeout = undefined;
        placementPending = false;
    }

    function startPlacementObserver() {
        stopPlacementObserver();

        const tryPlaceButton = () => {
            placementPending = false;
            if (addButton()) stopPlacementObserver();
        };

        // The companion filter is added asynchronously. Observe only while it
        // is being rendered, then disconnect instead of observing the page for
        // its entire lifetime.
        placementObserver = new MutationObserver(() => {
            if (!placementPending) {
                placementPending = true;
                queueMicrotask(tryPlaceButton);
            }
        });
        placementObserver.observe(document.documentElement, { childList: true, subtree: true });
        placementTimeout = window.setTimeout(stopPlacementObserver, 5000);
        tryPlaceButton();
    }

    function observePage() {
        startPlacementObserver();

        // Add the button immediately after in-app navigation by the companion bundle.
        const stashdb = unsafeWindow.stashdb;
        stashdb.addEventListener('page', () => window.setTimeout(startPlacementObserver, 0));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observePage, { once: true });
    } else {
        observePage();
    }
})();
