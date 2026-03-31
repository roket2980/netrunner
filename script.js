// 1. Initialize our data structure
let appData = JSON.parse(localStorage.getItem('codeSnippetData')) || [];

// 2. Grab our HTML elements
const folderList = document.getElementById('folder-list');
const newFolderBtn = document.getElementById('new-folder-btn');
const snippetList = document.getElementById('snippet-list');
const editorArea = document.getElementById('editor-area');
const saveBtn = document.getElementById('save-snippet-btn');

let currentFolderId = null;
let currentSnippetId = null;

// 3. Function to save data to browser storage
function saveData() {
    localStorage.setItem('codeSnippetData', JSON.stringify(appData));
}

// 4. Function to render folders in the sidebar
function renderFolders() {
    folderList.innerHTML = '';
    appData.forEach(folder => {
        const li = document.createElement('li');
        li.textContent = folder.name;
        li.onclick = () => openFolder(folder.id);
        folderList.appendChild(li);
    });
}

// 5. Create a new folder
newFolderBtn.onclick = () => {
    const name = prompt("Name this folder:");
    if (name) {
        appData.push({
            id: 'f_' + Date.now(),
            name: name,
            snippets: []
        });
        saveData();
        renderFolders();
    }
};

// 6. Open a folder and show its snippets
function openFolder(folderId) {
    currentFolderId = folderId;
    const folder = appData.find(f => f.id === folderId);
    document.getElementById('current-folder-name').textContent = folder.name;
    document.getElementById('new-snippet-btn').style.display = 'block';
    editorArea.style.display = 'none'; // Hide editor when switching folders
    
    // Render snippets
    snippetList.innerHTML = '';
    folder.snippets.forEach(snippet => {
        const div = document.createElement('div');
        div.className = 'snippet-card';
        div.innerHTML = `<h3>${snippet.title}</h3><small>${snippet.language}</small>`;
        div.onclick = () => openSnippet(folderId, snippet.id);
        snippetList.appendChild(div);
    });
}

// 7. Create a new snippet
document.getElementById('new-snippet-btn').onclick = () => {
    const folder = appData.find(f => f.id === currentFolderId);
    const newSnippet = {
        id: 's_' + Date.now(),
        title: "Untitled Snippet",
        language: "javascript",
        code: "// Write your code here"
    };
    folder.snippets.push(newSnippet);
    saveData();
    openFolder(currentFolderId); // Refresh the list
    openSnippet(currentFolderId, newSnippet.id); // Open it in editor
};

// 8. Open a snippet in the editor
function openSnippet(folderId, snippetId) {
    currentSnippetId = snippetId;
    editorArea.style.display = 'flex';
    
    const folder = appData.find(f => f.id === folderId);
    const snippet = folder.snippets.find(s => s.id === snippetId);
    
    document.getElementById('snippet-title').value = snippet.title;
    document.getElementById('snippet-language').value = snippet.language;
    document.getElementById('snippet-code').value = snippet.code;
}

// 9. Save the snippet when the save button is clicked
saveBtn.onclick = () => {
    const folder = appData.find(f => f.id === currentFolderId);
    const snippet = folder.snippets.find(s => s.id === currentSnippetId);
    
    snippet.title = document.getElementById('snippet-title').value;
    snippet.language = document.getElementById('snippet-language').value;
    snippet.code = document.getElementById('snippet-code').value;
    
    saveData();
    openFolder(currentFolderId); // Refresh the list to show new title
    
    alert("Snippet Saved!");
};

// Initial render on page load
renderFolders();
