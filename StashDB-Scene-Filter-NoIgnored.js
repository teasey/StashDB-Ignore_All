// ==UserScript==
// @name         StashDB Scene Filter - No Ignored
// @namespace    https://github.com/7dJx1qP/stashdb-userscripts
// @version      1.0.0
// @description  Adds non-ignored Owned and Missing filters to the StashDB Scene Filter dropdown.
// @match        https://stashdb.org/*
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const OWNED_NO_IGNORED = 'OWNED_NO_IGNORED';
    const MISSING_NO_IGNORED = 'MISSING_NO_IGNORED';
    let waitObserver;
    let waitTimeout;

    function updateVisibility(select) {
        for (const sceneCard of document.querySelectorAll('.SceneCard')) {
            const column = sceneCard.parentElement;
            if (!column) continue;

            const isOwned = Boolean(sceneCard.querySelector('.stash_id_match.match-yes'));
            const isIgnored = sceneCard.classList.contains('stash_id_ignored');
            const show = select.value === OWNED_NO_IGNORED
                ? isOwned && !isIgnored
                : select.value === MISSING_NO_IGNORED
                    ? !isOwned && !isIgnored
                    : true;

            if (select.value === OWNED_NO_IGNORED || select.value === MISSING_NO_IGNORED) {
                column.classList.toggle('d-none', !show);
            }
        }
    }

    function install(select) {
        if (select.dataset.noIgnoredFilterInstalled) return true;

        const showAll = [...select.options].some(option => option.value === 'ALL');
        if (!showAll) return false;

        const ownedOption = new Option('Show Owned no Ignored', OWNED_NO_IGNORED);
        const missingOption = new Option('Show Missing no Ignored', MISSING_NO_IGNORED);
        select.add(ownedOption);
        select.add(missingOption);
        select.dataset.noIgnoredFilterInstalled = 'true';

        select.addEventListener('change', () => updateVisibility(select));
        return true;
    }

    function stopWaiting() {
        waitObserver?.disconnect();
        waitObserver = undefined;
        window.clearTimeout(waitTimeout);
        waitTimeout = undefined;
    }

    function installOnCurrentPage() {
        const select = document.querySelector('.visible-filter select');
        if (select && install(select)) {
            stopWaiting();
            return;
        }

        if (waitObserver) return;
        waitObserver = new MutationObserver(() => {
            const filterSelect = document.querySelector('.visible-filter select');
            if (filterSelect && install(filterSelect)) stopWaiting();
        });
        waitObserver.observe(document.documentElement, { childList: true, subtree: true });
        waitTimeout = window.setTimeout(stopWaiting, 5000);
    }

    function start() {
        installOnCurrentPage();

        unsafeWindow.stashdb.addEventListener('scenecard', () => {
            const select = document.querySelector('.visible-filter select');
            if (select?.value === OWNED_NO_IGNORED || select?.value === MISSING_NO_IGNORED) {
                updateVisibility(select);
            }
        });

        // The companion bundle is expected to be installed and emits this event
        // after each in-app navigation. The timeout lets its Scene Filter create
        // the dropdown before we extend it.
        unsafeWindow.stashdb.addEventListener('page', () => {
            window.setTimeout(installOnCurrentPage, 0);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
