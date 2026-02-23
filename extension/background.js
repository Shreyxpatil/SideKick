// background.js
// Service worker for Chrome Extension

chrome.runtime.onInstalled.addListener(() => {
    console.log("Sidekick Extension Installed.");

    // Initialize empty profile in local storage if not exists to ensure stateless operation
    chrome.storage.local.get(["profileData"], (result) => {
        if (!result.profileData) {
            chrome.storage.local.set({ profileData: {} });
        }
    });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "GET_PROFILE") {
        chrome.storage.local.get(["profileData"], (result) => {
            sendResponse({ profile: result.profileData || {} });
        });
        return true; // Keep the message channel open for async response
    }
});
