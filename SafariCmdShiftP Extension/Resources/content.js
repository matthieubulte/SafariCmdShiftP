var HTML = '';
(async function() {
    const response = await fetch(chrome.runtime.getURL("popup.html"));
    HTML = await response.text();
})();

document.addEventListener("keydown", (event) => {
  if (event.metaKey && event.shiftKey && event.code === "KeyP") {
    CommandBar();
    event.preventDefault();
    event.stopPropagation();
  }
});

function matches(str, search) {
    return str.toLowerCase().indexOf(search) > -1;
}


function CommandBar() {
    if (document.getElementById("commandBarBody")) return;
    
    // ####################################################################################
    // STATE
    // ####################################################################################
    var selectedRow = undefined;
    var rowsList = undefined;
    var cleanUp = undefined;
    
    // ####################################################################################
    // BACKGROUND API
    // ####################################################################################
    function getTabs() {
        return chrome.runtime.sendMessage({ type: "getTabs" });
    }
    
    function searchHistory(searchString) {
        return chrome.runtime.sendMessage({ type: "searchHistory", searchString });
    }

    function showTab(id) {
        return chrome.runtime.sendMessage({ type: "showTab", id: id });
    }

    function search(searchString) {
        return chrome.runtime.sendMessage({ type: "search", searchString });
    }


    // ####################################################################################
    // RENDERING / DOM
    // ####################################################################################
    function renderContainer() {
        const commandBarDiv = document.createElement("div");
        commandBarDiv.id = "commandBarBody";
        commandBarDiv.style.position = "fixed";
        commandBarDiv.style.top = "0";
        commandBarDiv.style.left = "0";
        commandBarDiv.style.width = "100%";
        commandBarDiv.style.height = "100%";
        commandBarDiv.style.zIndex = "999999";
        commandBarDiv.innerHTML = HTML;
        document.body.appendChild(commandBarDiv);
        return commandBarDiv;
    }
    
    function removeRows(parent) {
        const children = parent.getElementsByClassName('tabDiv');
        Array.from(children).forEach(el => parent.removeChild(el));
    }
    
    function close() {
        document.body.removeChild(commandBarDiv);
        if (cleanUpListeners) {
            cleanUpListeners();
            cleanUpListeners = undefined;
        }
    }
    
    function renderRow(row, index) {
        const tabDiv = document.createElement("div");
        tabDiv.classList.add('tabDiv');
        tabDiv.id = `csp-tab-${index}`;
        if (row.type === 'tab') {
            const name = row.tab.title || row.tab.url;
            tabDiv.innerHTML = `
                <div class="csp-tab-title">${name}</div>
                <div class="csp-tab-action">→ Switch to tab </div>
            `;
        } else if (row.type === 'action') {
            tabDiv.innerHTML = `
                <div class="csp-tab-title">${row.title}</div>
                <div class="csp-tab-action"></div>
            `;
        } else if (row.type === 'history') {
            const name = row.entry.title || row.entry.url;
            tabDiv.innerHTML = `
                <div class="csp-tab-title">${row.entry.title} <span class="csp-tab-url">- ${row.entry.url}</span></div>
                <div class="csp-tab-action">+ Open new tab</div>
            `;
        } else if (row.type === 'search'){
            tabDiv.innerHTML = `<div>🔍 ${row.value}</div>`;
        }
        
        tabDiv.addEventListener("click", () => {
           handleOpen(row);
        });
        return tabDiv;
    }
    
    function render(parent, search, tabList, history) {
        removeRows(parent);
        const rows = makeRowContents(search, tabList, history);
        console.log(rows)
        rowsList = rows;
        const elements = rows.map(renderRow);
        elements.forEach(el => parent.appendChild(el));
        if (tabList.length) {
            selectRow(0);
        }
    }

    // ####################################################################################
    // Event listeners
    // ####################################################################################
    function setupListeners(commandInput) {
        const escapeListener = (event) => {
            if (event.key === "Escape") {
              close();
            }
        }
        document.addEventListener("keydown", escapeListener);

        commandInput.addEventListener('input', (event) => {
            refresh();
        });
        
        commandInput.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
              handleOpen(rowsList[selectedRow]);
          }
            if (event.keyCode == '38') {
               previousRow();
           }
           else if (event.keyCode == '40') {
               nextRow();
           }
        });
        
        return () => {
            document.removeEventListener("keydown", escapeListener);
        }
    }
    
    // ####################################################################################
    // Logic
    // ####################################################################################
    
    function copyPageUrl() {
        navigator.clipboard.writeText(window.location.href);
    }
    
    function searchActions(search) {
        const ACTION_ROWS = [
            { type: 'action', title: '🔗 Copy Page URL', action: copyPageUrl }
        ];
        
        return ACTION_ROWS.filter(a => matches(a.title, search));
    }
    
    function makeRowContents(search, tabs, matchingHistory) {
        const toRow = t => { return { type: 'tab', tab: t }};
        if (!search) {
            // remove pinned tabs unless the tab is active or we explicitely
            // search for one of them
            return tabs.filter(t => !t.pinned || t.active).map(toRow);
        } else {
            const searchRow = { type: 'search', value: search };
            
            const matchingTabs = tabs.filter(t =>  matches(t.title, search) || matches(t.url, search)).map(toRow);
            
            const matchingActions = searchActions(search);
            
            const historyRows = matchingHistory.map(h => { return { type: 'history', entry: h } });
            
            return matchingActions.concat(matchingTabs).concat(historyRows).concat([searchRow]);
        }
    }

    
    function handleOpen(row) {
        if (row.type === 'tab') {
            showTab(row.tab.id);
        } else if (row.type === 'action') {
            row.action();
        } else if (row.type === 'history') {
            search(row.entry.url);
        } else if (row.type === 'search') {
            search(row.value);
        }
        close();
    }
    
    function selectRow(index) {
        if (typeof selectedRow !== 'undefined') {
            document.getElementById(`csp-tab-${selectedRow}`).classList.remove('csp-tab-selected');
        }
        
        const row = document.getElementById(`csp-tab-${index}`);
        row.classList.add('csp-tab-selected');
        row.scrollIntoView({ block: 'nearest' });

        selectedRow = index;
    }
    
    function nextRow() {
        selectRow((selectedRow + 1) % rowsList.length);
    }
    
    function previousRow() {
        if (selectedRow - 1 == -1) selectRow(rowsList.length - 1);
        else selectRow((selectedRow - 1) % rowsList.length);
    }
    
    function refresh() {
        Promise.all([searchHistory(commandInput.value), getTabs()]).then(([history, tabs]) => {
            console.log(history)
            console.log(tabs)
            const resultsContainer = document.getElementById("commandBarResults");
            tabs = tabs || [];
            tabs.sort((a,b) => b.active - a.active);
            render(resultsContainer, commandInput.value, tabs, history);
        });
    }

    // ####################################################################################
    // Main
    // ####################################################################################
    
    const commandBarDiv = renderContainer();

    const commandInput = document.getElementById("commandInput");
    commandInput.focus();
    
    cleanUpListeners = setupListeners(commandInput);

    refresh();
}
