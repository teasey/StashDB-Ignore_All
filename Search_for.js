// ==UserScript==
// @name         StashDB – Search for Scene
// @namespace    https://github.com/7dJx1qP/stashdb-userscripts
// @version      1.0.1
// @description  Adds “Search for Scene” to the StashDB Userscripts scene-card menu.
// @author       Jan
// @match        https://stashdb.org/*
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const MENU_ITEM_CLASS = 'stashdb-search-for-scene';

    function stashIdFromCard(sceneEl) {
        const link = sceneEl.querySelector('.card-footer a[href*="/scenes/"]')
            || sceneEl.querySelector('a[href*="/scenes/"]');
        if (!link) return null;
        const match = new URL(link.href, location.origin).pathname.match(/^\/scenes\/([^/]+)$/);
        return match ? match[1] : null;
    }

    function fallbackSearchTerms(sceneEl) {
        const title = sceneEl.querySelector('.card-header h5, .card-title, h5, h4')?.textContent?.trim() || '';
        const performer = sceneEl.querySelector('a[href*="/performers/"]')?.textContent?.trim() || '';
        return [title, performer].filter(Boolean).join(' ');
    }

    async function sceneSearchTerms(stashdb, stashId, sceneEl) {
        const request = {
            operationName: 'SceneSearchTerms',
            variables: { id: stashId },
            query: `query SceneSearchTerms($id: ID!) {
                findScene(id: $id) {
                    title
                    performers { performer { name } }
                }
            }`,
        };
        const scene = (await stashdb.callStashDbGQL(request))?.data?.findScene;
        const title = scene?.title || sceneEl.querySelector('.card-header h5, .card-title, h5')?.textContent?.trim();
        const performer = scene?.performers?.[0]?.performer?.name || '';
        return [title, performer].filter(Boolean).join(' ');
    }

    function addMenuItem(stashdb, sceneEl, markerEl) {
        const menu = markerEl.querySelector('.dropdown-menu');
        // The original script only offers Ignore Scene / Add to Wishlist for
        // scenes that are not already in the local Stash library.
        if (!menu || menu.querySelector(`.${MENU_ITEM_CLASS}`) || !menu.textContent.includes('Ignore Scene')) return;

        const stashId = stashIdFromCard(sceneEl);
        if (!stashId) return;

        const item = document.createElement('a');
        item.className = `dropdown-item ${MENU_ITEM_CLASS}`;
        item.href = '#';
        item.textContent = 'Search for Scene';
        item.style.cssText = 'color: black; padding: 5px; text-decoration: none';

        item.addEventListener('click', async event => {
            event.preventDefault();
            event.stopImmediatePropagation();

            // Opening synchronously preserves the browser's user-gesture
            // permission; the result URL is filled in after the API lookup.
            const searchTab = window.open('about:blank', '_blank');
            if (!searchTab) {
                console.warn('[StashDB Search for Scene] The browser blocked the new tab.');
                return;
            }

            item.textContent = 'Searching…';
            try {
                const terms = await sceneSearchTerms(stashdb, stashId, sceneEl);
                if (!terms) throw new Error('No scene title was found.');
                searchTab.location.replace(`https://www.google.com/search?q=${encodeURIComponent(terms)}`);
            } catch (error) {
                console.error('[StashDB Search for Scene]', error);
                // Never close the user-visible tab on an API error. Cards still
                // contain enough information for a useful fallback search.
                const fallback = fallbackSearchTerms(sceneEl);
                if (fallback) {
                    searchTab.location.replace(`https://www.google.com/search?q=${encodeURIComponent(fallback)}`);
                    item.textContent = 'Searched with card data';
                } else {
                    searchTab.location.replace(`https://www.google.com/search?q=${encodeURIComponent(stashId)}`);
                    item.textContent = 'Searched by StashID';
                }
            }
        });

        menu.appendChild(item);
    }

    function wireMarker(stashdb, sceneEl) {
        const markerEl = sceneEl?.querySelector('.stash_id_match');
        if (!sceneEl || !markerEl || markerEl.dataset.searchForSceneWired) return;
        markerEl.dataset.searchForSceneWired = 'true';

        markerEl.addEventListener('mouseenter', () => {
            // The bundle's own hover handler creates the dropdown first.
            queueMicrotask(() => addMenuItem(stashdb, sceneEl, markerEl));
        });
    }

    function register(stashdb) {
        if (stashdb.__searchForSceneRegistered) return true;
        stashdb.__searchForSceneRegistered = true;

        stashdb.addEventListener('scenecard', event => {
            const sceneEl = event.detail?.sceneEl;
            wireMarker(stashdb, sceneEl);
        });

        // Covers cards the companion bundle had already rendered before this
        // add-on was initialized.
        document.querySelectorAll('.SceneCard').forEach(sceneEl => wireMarker(stashdb, sceneEl));
        return true;
    }

    const waitForBundle = window.setInterval(() => {
        const stashdb = typeof unsafeWindow === 'undefined' ? null : unsafeWindow.stashdb?.stashdb;
        if (stashdb && register(stashdb)) window.clearInterval(waitForBundle);
    }, 100);
})();
