// ==UserScript==
// @name         StashDB Scene Filter - No Ignored
// @namespace    https://github.com/7dJx1qP/stashdb-userscripts
// @version      1.1.2
// @description  Adds non-ignored Owned and Missing filters to the StashDB Scene Filter dropdown.
// @match        https://stashdb.org/*
// @grant        unsafeWindow
// @run-at       document-start
// ==/UserScript==

(function () {
    'use strict';

    const MISSING_NO_IGNORED = 'MISSING_NO_IGNORED';
    const FILTER_STORAGE_KEY = 'stashdb.sceneFilter.noIgnored';
    let waitObserver;
    let waitTimeout;

    function filterSceneCard(sceneCard, select) {
        const column = sceneCard?.parentElement;
        if (!column) return;

        // The bundle adds this marker only after it has loaded both the local
        // match and saved ignored state. Do not filter unresolved cards yet.
        const marker = sceneCard.querySelector('.stash_id_match');
        if (!marker) {
            column.classList.remove('d-none');
            return;
        }

        const isOwned = marker.classList.contains('match-yes');
        const isIgnored = sceneCard.classList.contains('stash_id_ignored');
        const show = select.value === MISSING_NO_IGNORED ? !isOwned && !isIgnored : true;

        if (select.value === MISSING_NO_IGNORED) {
            column.classList.toggle('d-none', !show);
        }
    }

    function updateVisibility(select) {
        for (const sceneCard of document.querySelectorAll('.SceneCard')) {
            filterSceneCard(sceneCard, select);
        }
    }

    function restoreSavedFilter(select) {
        if (sessionStorage.getItem(FILTER_STORAGE_KEY) === MISSING_NO_IGNORED) {
            select.value = MISSING_NO_IGNORED;
            updateVisibility(select);
        }
    }

    function install(select) {
        if (select.dataset.noIgnoredFilterInstalled) {
            restoreSavedFilter(select);
            return true;
        }

        const showAll = [...select.options].some(option => option.value === 'ALL');
        if (!showAll) return false;

        const missingOption = new Option('Show Missing no Ignored', MISSING_NO_IGNORED);
        select.add(missingOption);
        select.dataset.noIgnoredFilterInstalled = 'true';

        select.addEventListener('change', () => {
            sessionStorage.setItem(FILTER_STORAGE_KEY, select.value);
            updateVisibility(select);
        });

        // sessionStorage is scoped to this browser tab, so the selected filter
        // survives StashDB's in-app pagination without affecting other tabs.
        restoreSavedFilter(select);
        // Let companion controls attach only after this newly rendered filter
        // has finished being extended.
        document.dispatchEvent(new Event('stashdb-no-ignored-filter-ready'));
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
        const stashdb = unsafeWindow.stashdb.stashdb;

        function reapplyAfterNavigation() {
            // StashDB can restore a cached page after its navigation event.
            // Reapply a few times during that short render window, then stop.
            for (const delay of [0, 150, 600]) {
                window.setTimeout(() => {
                    installOnCurrentPage();
                    const select = document.querySelector('.visible-filter select');
                    if (select?.value === MISSING_NO_IGNORED) updateVisibility(select);
                }, delay);
            }
        }

        stashdb.addEventListener('scenecard', event => {
            const select = document.querySelector('.visible-filter select');
            if (select?.value === MISSING_NO_IGNORED) {
                // Filter only the just-resolved card. Re-filtering every card
                // during history navigation can mix outgoing and incoming pages.
                window.setTimeout(() => filterSceneCard(event.detail?.sceneEl, select), 0);
            }
        });

        // The companion bundle is expected to be installed and emits this event
        // after each in-app navigation. The timeout lets its Scene Filter create
        // the dropdown before we extend it.
        stashdb.addEventListener('page', () => {
            reapplyAfterNavigation();
        });

        // Pagination changes only the query string, so some StashDB versions do
        // not emit a bundle page event. Listen to SPA history navigation too.
        const scheduleInstall = reapplyAfterNavigation;
        const originalPushState = history.pushState;
        history.pushState = function (...args) {
            const result = originalPushState.apply(this, args);
            scheduleInstall();
            return result;
        };
        const originalReplaceState = history.replaceState;
        history.replaceState = function (...args) {
            const result = originalReplaceState.apply(this, args);
            scheduleInstall();
            return result;
        };
        window.addEventListener('popstate', scheduleInstall);
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
        start();
    }
})();
