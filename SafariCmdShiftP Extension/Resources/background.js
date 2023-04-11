function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (err) {
    return false;
  }
}

function matches(str, search) {
    if (!str) return false;
    if (!search) return true;
    return str.toLowerCase().indexOf(search) > -1;
}

function cleanupOldHistoryEntries() {
  const tenDaysAgo = new Date().getTime() - 10 * 24 * 60 * 60 * 1000;

  chrome.storage.sync.get(null, (data) => {
    Object.entries(data).forEach(([key, value]) => {
      if (value.time < tenDaysAgo) {
        chrome.storage.sync.remove(key);
      }
    });
  });
}

function addToHistory(historyItem) {
    const url = historyItem.url;
    if (!matches(url, 'www.google.com/search')) {
        chrome.storage.local.set({ [historyItem.url]: historyItem });
        cleanupOldHistoryEntries();
    }
}

chrome.webNavigation.onCompleted.addListener((details) => {
  if (details.frameId === 0) { // Ensure it's the main frame
    chrome.tabs.get(details.tabId).then((tab) => {
      const historyItem = {
        url: tab.url,
        title: tab.title,
        time: new Date().getTime()
      };
      addToHistory(historyItem);
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    console.log(request);
    return new Promise((resolve, reject) => {
        if (request.type === 'getTabs') {
            chrome.tabs.query({ currentWindow: true }).then((tabs) => {
                resolve(tabs);
            });
        } else if (request.type === "searchHistory") {
            const searchString = request.searchString;
            if (!searchString) {
                resolve([]);
                return;
            }

            chrome.storage.local.get(null).then((data) => {
                const browserHistory = Object.values(data);
                
              const searchResults = browserHistory
                .filter((item) => matches(item.url, searchString) || matches(item.title, searchString))
                .sort((a, b) => b.time - a.time);

                resolve(searchResults);
            });
          } else if (request.type === 'showTab') {
            chrome.tabs.update(request.id, {active: true});
            resolve();
        } else if (request.type === 'search') {
            const url = isValidUrl(request.searchString) ? request.searchString : ("http://www.google.com/search?q=" + encodeURIComponent(request.searchString));
            chrome.tabs.create({ url });
        } else if (request.type === 'copyToClipBoard') {
            navigator.clipboard.writeText('test');
        }
    });
});
