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
        if (!sceneCards().length) return;

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

        // The companion Scene Filter creates this dropdown. Putting the button
        // after its wrapper makes it appear immediately to the right of it.
        const visibleFilter = document.querySelector('.visible-filter');
        if (visibleFilter) {
            visibleFilter.insertAdjacentElement('afterend', button);
            return;
        }

        // Fallback for use without the companion Scene Filter.
        const sceneSort = document.querySelector('.scene-sort');
        if (sceneSort?.parentElement) sceneSort.insertAdjacentElement('afterend', button);
    }

    function observePage() {
        addButton();
        new MutationObserver(addButton).observe(document.documentElement, { childList: true, subtree: true });

        // When the companion bundle is installed, its SPA navigation event lets us
        // add the button immediately after every in-app page change.
        const stashdb = typeof unsafeWindow === 'undefined' ? null : unsafeWindow.stashdb;
        stashdb?.addEventListener?.('page', () => window.setTimeout(addButton, 0));
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observePage, { once: true });
    } else {
        observePage();
    }
})();
