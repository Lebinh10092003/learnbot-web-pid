import {LogLevel, parseLogLevel}  from "./LeanLogLevel.js";

export class LeanFs{
    static #FS_VER      =     "LeanFs10"
    static #LS_KEY_TREE =     `${LeanFs.#FS_VER}__tree`;
    static #FILE_KEY_PREFIX = `${LeanFs.#FS_VER}_`;
    static #rootUUID =        "bd70ce61-fc7d-41a5-b0f9-0017e998813a"; // random generate from https://www.uuidgenerator.net/

    static #LocalConfigUUID = "0b4ece3e-16c0-4f6c-9de9-847f3a1ab480"; // random generate from https://www.uuidgenerator.net/

    static leanfs_TYPE = Object.freeze({
        DIR:        "dir",
        INO:        "ino",
        BLOCKLY:    "blockly",
        YAML:       "yaml",
        OTHERS:     "others"
    });

    #items = {}
    #contentHash = {};
    #delaySaveTree = false
    #treeHash = null;

    static #config = null;
    static #localLogLevel = LogLevel.INFO;
    
    constructor(){
        // Enforce to always create New Object
        if (!new.target) {
            throw new Error("LeanFs must be called with 'new'");
        }
        this.#delaySaveTree = false;
        this.#items = {};
        this.#treeHash = null;
    }

    static setConfig(config){
        if(config?.LogLevel){
            LeanFs.#config = config;
            LeanFs.#localLogLevel = parseLogLevel(LeanFs.#config.LogLevel); // text => enum-like
            LeanFs.logInfo("loadConfig", "Log Level = ", LeanFs.#config.LogLevel);
        }
    }

    static logDebug(tag, ...args) {
        if (LeanFs.#localLogLevel >= LogLevel.DEBUG) {
            console.debug(`[LeanFs.${tag}] [D]`, ...args);
        }
    }

    static logInfo(tag, ...args){
        if(LeanFs.#localLogLevel >= LogLevel.INFO)
            console.info(`[LeanFs.${tag}] [I]`, ...args);
    }

    static logWarn(tag, ...args){
        if(LeanFs.#localLogLevel >= LogLevel.WARN)
            console.warn(`[LeanFs.${tag}] [W]`, ...args);
    }

    static logError(tag, ...args){
        if(LeanFs.#localLogLevel >= LogLevel.ERROR)
            console.error(`[LeanFs.${tag}] [E]`, ...args);
    }

    async mount(){
        try{
            // Restore workspace from localStorage if available (overwrites items, root UUID, and currentID).
            await this.#loadTree(); 
            LeanFs.logInfo("mount", "Mount success");
        }
        catch(e){
            const err = `Mount Failed!. Error occur: ${e}`
            // alert(err);
            LeanFs.logError("mount", err);
            // throw new Error(err)            
        }
    }

    /**-------------------------------------------------------- */
    /** getItems()
    * Dev-only accessor for StaticTreeDataProvider.
    * Exposes live data; any other use can corrupt filesystem state.
    */
    getItems(){
        return this.#items;
    }
    /**-------------------------------------------------------- */

    getRoot(){
        return LeanFs.#rootUUID;
    }

    getLocalConfigUUID(){
        return LeanFs.#LocalConfigUUID;
    }

    getParent(itemUUID) { // Return 
        const it = this.#getItem(itemUUID);
        if(!it) return null;

        const p = this.#getItem(it.parent);
        if(!p)return null;

        return p.index;
    }

    getAllChildren(itemUUID) { // Return children array of this one node (if there is any)
        if(!this.isDir(itemUUID))return null;
        return (this.#items[itemUUID].children || []).filter(cid => this.#items[cid]);
    }

    isExist(itemUUID) {
        return !!this.#getItem(itemUUID);
    }

    isFile(itemUUID) {
        if(itemUUID == this.getLocalConfigUUID())return true; // special case: if item is local config always exitst
        const item = this.#getItem(itemUUID);
        if (!item) return false;
        return item.isFolder === false;
    }

    isDir(itemUUID) {
        const item = this.#getItem(itemUUID);
        if (!item) return false;
        return item.isFolder === true;
    }

    async createFile(parentUUID){ // default name = timestamp

        const childUUID = await this.#createItem(parentUUID);
        if(!childUUID) return null;

        this.#items[childUUID].isFolder = false; // file

        this.#saveTree();

        return childUUID;
    }

    async createDir(parentUUID){ // default name = timestamp

        const childUUID = await this.#createItem(parentUUID);
        if(!childUUID) return null;

        this.#items[childUUID].isFolder = true; // dir
        this.#items[childUUID].children = [];

        this.#saveTree();

        return childUUID;
    }

    // rename file bằng F2
    async rename(itemUUID, newName) {

        if (itemUUID === this.getRoot()) return; // NEVER rename root
        
        const item = this.#getItem(itemUUID);
        if (!item) return;
        
        item.data = newName;
        LeanFs.logInfo("rename", {uuid: itemUUID, newName: newName});

        await this.#saveTree();
    }

    getName(itemUUID){
        const item = this.#getItem(itemUUID);
        if(!item) return null;
        return item.data;
    }

    getItemType(itemUUID) {

        // Folders are directories regardless of name or extension (include root)
        if (this.isDir(itemUUID)) return LeanFs.leanfs_TYPE.DIR;

        // Extract file extension from the last '.' only
        // Examples:
        //   "a.b.c.txt"   -> "txt"
        //   "file.yaml"   -> "yaml"
        //   "noext"       ->  null (no extension)
        //  ".gitignore"   ->  null (no extension)
        const ext = (() => {
            const item = this.#items[itemUUID];
            if (typeof item === "undefined") return null;

            const name = item.data;
            if (typeof name !== "string") return null;

            const lastDot = name.lastIndexOf(".");
            if (lastDot <= 0) return null;
            if (lastDot === name.length - 1) return null;
            return name.slice(lastDot + 1).toLowerCase();
        })();

        switch (ext) {
            case "ino":
                return LeanFs.leanfs_TYPE.INO;
            case "bduino":
                return LeanFs.leanfs_TYPE.BLOCKLY;
            case "yaml":
                return LeanFs.leanfs_TYPE.YAML;
            default:
                return LeanFs.leanfs_TYPE.OTHERS;
        }
    }

    isType(itemUUID, leanfs_TYPE){
        return leanfs_TYPE === this.getItemType(itemUUID);
    }

    isBlocklyFile(itemUUID){
        return ( this.isType(itemUUID, LeanFs.leanfs_TYPE.BLOCKLY) );
    }

    isInoFile(itemUUID){
        return ( this.isType(itemUUID, LeanFs.leanfs_TYPE.INO) );
    }

    async readFile(itemUUID) {

        if (!this.isFile(itemUUID)) return null; // not a file, not local config => return

        const compressed = localStorage.getItem(this.#fileKey(itemUUID));

        if (!compressed) return null;

        // normal file (in tree)
        try {
            const content = await decompressString(compressed);

            this.#contentHash[itemUUID] = await getStringHash(content);
            return content;

        } catch (err) {

            const fallbackRawData =`ERROR : File corrupted\nRaw file data:\n\n${compressed}`;

            LeanFs.logError("readFile", `File corrupted, err: ${err}`);

            this.#contentHash[itemUUID] = await getStringHash(fallbackRawData);

            return fallbackRawData;
        }
    }

    async writeFile(itemUUID, content) {

        if (!this.isFile(itemUUID)) return; // not a file, not local config => return

        const oldHash = this.#contentHash[itemUUID];
        const newHash = await getStringHash(content);

        if(oldHash === newHash){
            return;
        }
        
        const compressed = await compressString(content);
        localStorage.setItem(this.#fileKey(itemUUID), compressed);

        this.#contentHash[itemUUID] = newHash;
        LeanFs.logDebug("writeFile", {uuid: itemUUID, hash: newHash});
    }

    async linkFile(itemUUID, parentUUID){ // add a FILE to the file tree

        if(this.isExist(itemUUID))return; // already present -> ignore duplicate link

        if(itemUUID === this.getRoot())return; // root cannot be linked as a child

        if(!this.isDir(parentUUID))return; // parent must be a directory node

        if(itemUUID === parentUUID)return; // prevent self-parenting

        this.#items[itemUUID] = { 
            index: itemUUID, 
            isFolder: false, 
            children: null, 
            data: getTimestampName(), // default timestamp name
            parent: parentUUID};

        const p = this.#getItem(parentUUID);
        p.children ||= [];
        p.children.unshift(itemUUID); // keep newly created items at the top of the list
        
        LeanFs.logInfo("linkFile", "add to tree:", this.#items[itemUUID])
        await this.#saveTree();
    }

    async unlinkFile(itemUUID){ // remove a file from tree
        if(itemUUID === this.getRoot())return; // NEVER delete root id.
        if (this.isFile(itemUUID) === false) return;

        // log to debug
        LeanFs.logInfo("unlinkFile", "removed: ", { uuid: itemUUID });

        // gỡ itemUUID khỏi mọi folder trước, tránh lệch parent sau drag
        this.#removeFromParent(itemUUID);
        this.#deleteItem(itemUUID);

        await this.#saveTree();
    }

    async deleteFile(itemUUID) { // remove a file from tree and localStorage
        
        if(itemUUID === this.getRoot())return; // NEVER delete root id.
        if (this.isFile(itemUUID) === false) return;

        // log to debug
        LeanFs.logInfo("deleteFile", "removed: ", { uuid: itemUUID });

        // gỡ itemUUID khỏi mọi folder trước, tránh lệch parent sau drag
        this.#removeFromParent(itemUUID);

        this.#removeItem(itemUUID);
        await this.#saveTree();
    }

    readDir(itemUUID, prefix = "") {
        if (!this.isExist(itemUUID)) return ""; // item not exist

        const folderNode = this.#items[itemUUID];

        if (this.isFile(itemUUID)) return `${prefix}${folderNode.data}`; // file => return name

        const lines = [];
        lines.push(folderNode.data + " /"); // folder name

        const children = this.getAllChildren(itemUUID);

        if (children.length === 0) {
            lines.push(`${prefix}└─ Folder empty`); // empty folder
            return lines.join("\n");
        }

        children.forEach((child, index) => {
            const isLast = index === children.length - 1;
            const connector = isLast ? "└─ " : "├─ ";
            const isChildFolder = this.isDir(child);

            const childPrefix = prefix + (isLast ? "   " : "│  "); // next level prefix
            const contentPrefix = isChildFolder
                ? childPrefix
                : prefix + connector; // prefix passed to recursion

            const content = this.readDir(child, contentPrefix); // recursive call

            lines.push(
                isChildFolder
                    ? prefix + connector + content // folder entry
                    : content // file entry
            );
        });

        return lines.join("\n");
    }

    async deleteDir(itemUUID) {
        if (!this.isDir(itemUUID)) return;

        if(itemUUID === this.getRoot())return; // NEVER delte root id.

        let prevDelaySaveTree = this.#delaySaveTree
        this.#delaySaveTree = true

        const children = [...this.getAllChildren(itemUUID)];
        
        for(const child of children){ // remove subtree
            if(this.isFile(child)) await this.deleteFile(child);
            if(this.isDir(child)) await this.deleteDir(child);
        };
        this.#removeFromParent(itemUUID); // Remove this directory from its parent

        this.#removeItem(itemUUID); // Remove the directory itself
        LeanFs.logInfo("deleteDir",  "removed: ", { uuid: itemUUID });

        this.#delaySaveTree = prevDelaySaveTree
        await this.#saveTree();
    }

    // find and load from tree with absolute path 
    // e.g: path = test/test.txt => find test.txt inside test inside root.
    getItemByPath(parentUUID, pathString){

        if(!this.isDir(parentUUID))return null; // parentUUID is not dir

        const parts = String(pathString).trim().split("/").filter(Boolean);
        let currentId = parentUUID; // start at parent

        if (!currentId) return null;

        for (const name of parts) {

            const nextId = this.getChildByName(currentId, name);

            if (!nextId) return null;

            currentId = nextId; // go to text level of the tree
        }
        return currentId;
    }

    getChildByName(parentUUID, name){

        if(!this.isDir(parentUUID))return null; // parentUUID is not dir

        const children = this.getAllChildren(parentUUID);

        if (!children.length) return null; // dir is emtpy

        const childUUID  = children.find(
            uuid => this.getName(uuid) === name
        );

        return childUUID ;
    }

    getAncestorFolders(uuid) { // get ancestor until the root
        const out = [];
        let p = this.getParent(uuid);

        while (p && p !== this.getRoot()) {
            out.unshift(p);
            p = this.getParent(p);
        }
        return out;
    }

    hasAnyFileOfType(type) { // Check if there is any .ino file in the workspace
        const stack = [this.getRoot()];
        while (stack.length) {
            const id = stack.pop();
            if (this.isType(id, type)) return true;
            if (this.isDir(id)) stack.push(...this.getAllChildren(id));
        }
        return false;
    }

    pickNextItemAfterDelete(uuid) {
        // Prefer parent folder
        const parent = this.getParent(uuid);
        if (parent && parent !== this.getRoot()) {
            return parent;
        }

        // Otherwise scan root children
        const children = this.getAllChildren(this.getRoot());
        let firstFolder = null;

        for (const id of children) {
            if (id === uuid) continue;

            if (this.isFile(id)) {
                return id;
            }

            if (!firstFolder) {
                firstFolder = id;
            }
        }

        return firstFolder || null;
    }

    async insertAtIndex(folderId, childId, atIndex) {

        if (!this.isExist(childId)) return null;

        if (!this.isDir(folderId)) return null;

        const remmovedParent = this.#removeFromParent(childId); // remove childId from old parent (if any)

        const f = this.#items[folderId];

        f.children = f.children.filter((x) => x !== childId); // remove childId if already exist to avoid duplicate

        let idx = Number.isFinite(atIndex) ? atIndex : f.children.length;
        if (idx < 0) idx = 0;
        if (idx > f.children.length) idx = f.children.length;

        f.children.splice(idx, 0, childId);     // insert childId at the correct position
        this.#items[childId].parent = folderId; // change parent 

        await this.#saveTree(); // save tree after reorder

        return remmovedParent
    }

    isAncestorOf(folderId, itemId){
        if (!this.isDir(folderId)) return false;
        let ancestors = this.getAncestorFolders(itemId);
        return ancestors.includes(folderId);
    }

    //============================================================
    // Private
    //============================================================

    // === Storage Manage === //

    async #saveTree() {
        switch(LeanFs.#FS_VER){
            case "LeanFs10":
                return this.#saveTree_FS10();
            case "LeanFs11":
                return this.#saveTree_FS11();
            default:
                throw new Error("Undefined LeanFs Ver")
        }
    }

    async #saveTree_FS10() {
        if (this.#delaySaveTree) {return;}

        // Check if tree changed before save
        const treeContent = JSON.stringify(this.#items);
        const newHash = await getStringHash(treeContent);

        if(this.#treeHash === newHash){
            LeanFs.logDebug("saveTree","Skip (unchanged)");
            return;
        }

        this.#treeHash = newHash;

        // save tree
        LeanFs.logDebug("saveTree", "Save workspace");
        const items = {};

        for(const [uuid, item] of Object.entries(this.#items)){
            items[uuid] = {
                data: item.data,
                children: Array.isArray(item.children) ? [...item.children] : null,
            };
        }

        const json = JSON.stringify(items);

        localStorage.setItem(LeanFs.#LS_KEY_TREE, json);
    }

    async #saveTree_FS11() {
        if (this.#delaySaveTree) {return;}

        // Check if tree changed before save
        const treeContent = JSON.stringify(this.#items);
        const newHash = await getStringHash(treeContent);

        if(this.#treeHash === newHash){
            LeanFs.logDebug("saveTree","Skip (unchanged)");
            return;
        }

        this.#treeHash = newHash;

        const uuidToIndexMap = buildUuidIndexMap(this.#items);
        LeanFs.logDebug("saveTree", "Saved Tree order (uuid: index):", uuidToIndexMap);

        // save tree
        LeanFs.logDebug("saveTree", "Save workspace");
        const items = {};

        for(const [uuid, item] of Object.entries(this.#items)){
            items[uuid] = {
                data: item.data,
                children: mapChildrenUuidToIndex(item.children, uuidToIndexMap), // convert children uuid to index
            };
        }

        const json = JSON.stringify(items);

        localStorage.setItem(LeanFs.#LS_KEY_TREE, json);
    }

    #fileKey(uuid) {
        return LeanFs.#FILE_KEY_PREFIX + uuid;
    }

    async #newTree(){ // first time creating tree
        this.#items = {
            [LeanFs.#rootUUID]: {
                index: LeanFs.#rootUUID, // root
                isFolder: true,
                children: [],
                data: "Workspace",
            },
        };
        await this.#saveTree();
    }

    async #loadTree() {
        switch(LeanFs.#FS_VER){
            case "LeanFs10":
                return this.#loadTree_FS10();
            case "LeanFs11":
                return this.#loadTree_FS11();
            default:
                throw new Error("Undefined LeanFs Ver")
        }
    }   

    async #loadTree_FS10() {
        try {
            const rawTree = localStorage.getItem(LeanFs.#LS_KEY_TREE);

            if (!rawTree) {
                LeanFs.logInfo("loadTree", "No workspace found in localStorage, creating new");
                await this.#newTree();
                return;
            }
            
            this.#items = JSON.parse(rawTree)

            // loop through json key value list
            for (const [uuid, item] of Object.entries(this.#items)) {
                item.isFolder = Array.isArray(item.children);
                if (!item.isFolder) item.children = null; // extra safe
                item.index = uuid
            }

            this.#rebuildParents();

            // await this.#saveTree();
            LeanFs.logInfo("loadTree", "Workspace restored");
        } catch (e) {
            LeanFs.logError("loadTree", "Restore failed", e);
            throw e;
        } 
        // finally {
        //     await this.#saveTree();
        // }
    }

    async #loadTree_FS11() {
        try {
            const rawTree = localStorage.getItem(LeanFs.#LS_KEY_TREE);

            if (!rawTree) {
                LeanFs.logInfo("loadTree", "No workspace found in localStorage, creating new");
                await this.#newTree();
                return;
            }
            
            this.#items = JSON.parse(rawTree)

            const uuidToIndexMap = buildUuidIndexMap(this.#items); 
            LeanFs.logDebug("loadTree", "Load Tree order (uuid: index):", uuidToIndexMap) // log to test

            // loop through json key value list
            for (const [uuid, item] of Object.entries(this.#items)) {
                item.isFolder = Array.isArray(item.children);
                if (!item.isFolder) item.children = null; // extra safe
                else item.children = mapChildrenIndexToUuid(item.children, uuidToIndexMap); // convert children index back to uuid
                item.index = uuid
            }

            this.#rebuildParents();

            // await this.#saveTree();
            LeanFs.logInfo("loadTree", "Workspace restored");
        } catch (e) {
            LeanFs.logError("loadTree", "Restore failed", e);
            throw e;
        } 
        // finally {
        //     await this.#saveTree();
        // }
    }

    #getItem(itemUUID){
        if(!itemUUID)return null;
        return this.#items[itemUUID];
    }

    #deleteItem(itemUUID){ // remove an item from tree
        // delete this.#contentHash[itemUUID];
        delete this.#items[itemUUID];
    }

    #removeItem(itemUUID){ // remove an item from tree and localStorage
        localStorage.removeItem(this.#fileKey(itemUUID));
        this.#deleteItem(itemUUID);
    }

    // === File management === //

    // Gắn parent cho mỗi node, để move nhanh
    #rebuildParents() {

        for (const [uuid, item] of Object.entries(this.#items)) {
            item.parent = null;
        }

        for (const [uuid, item] of Object.entries(this.#items)) {
            const ch = item.children;
            if (!Array.isArray(ch)) continue;
            for (const cid of ch) if (this.#items[cid]) this.#items[cid].parent = uuid;
        }
        
        LeanFs.logDebug("rebuildParents", "Rebuilt parent pointers");
    }

    // drag drop, reorder, move folder
    #removeFromParent(childId) {
        let removedParent = null;

        const parentUUID = this.getParent(childId);
        const p = this.#getItem(parentUUID);

        if (p?.children) {
            const list = p.children;
            const before = list.length;
            p.children = list.filter((x) => x !== childId);
            if (p.children.length !== before) removedParent = parentUUID;
        }

        // fallback: nếu parent bị sai, quét toàn bộ folder để xóa mọi chỗ đang chứa childId
        for (const [uuid, item] of Object.entries(this.#items)) {
            if (!this.isDir(uuid)) continue;
            if (!Array.isArray(item.children)) continue;

            const before = item.children.length;
            item.children = item.children.filter((x) => x !== childId);
            if (item.children.length !== before) removedParent = removedParent || uuid;
        }


        return removedParent;
    }

    // === Create New item (file or dir) === // 

    // Thêm file, folder
    async #createItem(parentId) {

        if(!this.isDir(parentId))return; // parent must be a directory node
        
        const p = this.#getItem(parentId);
        if(!p)return null;

        const uuid = createUUID();

        this.#items[uuid] = { index: uuid, isFolder: null, children: null, data: getTimestampName(), parent: parentId};
        p.children ||= [];
        // p.children.push(uuid);
        p.children.unshift(uuid); // keep newly created items at the top of the list

        LeanFs.logInfo("createItem", {name: this.#items[uuid].data, uuid: uuid , parent: parentId});
        // await this.#saveTree();

        return uuid;
    }
}

function createUUID() {
  return crypto.randomUUID();
}

function getTimestampName() {
  const d = new Date();

  const yyyy = d.getFullYear();
  const mm   = String(d.getMonth() + 1).padStart(2, "0");
  const dd   = String(d.getDate()).padStart(2, "0");

  const hh   = String(d.getHours()).padStart(2, "0");
  const mi   = String(d.getMinutes()).padStart(2, "0");
  const sec  = String(d.getSeconds()).padStart(2, "0");

  return `${yyyy}.${mm}.${dd}-${hh}.${mi}.${sec}`;
}

// === Compress Helper === // 

/* Uint8Array -> base64 */
function uint8ToBase64(bytes) {
    let binary = '';
    bytes.forEach(b => binary += String.fromCharCode(b));
    return btoa(binary);
}

/* base64 -> Uint8Array */
function base64ToUint8(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
}

async function compressString(str) {

    if(!compressString.textEncoder){
        compressString.textEncoder = new TextEncoder();
    }

    const t1 = performance.now();
    const stream = new Blob([compressString.textEncoder.encode(str)])
        .stream()
        .pipeThrough(new CompressionStream('gzip'));

    const buffer = await new Response(stream).arrayBuffer();
    const compressed = uint8ToBase64(new Uint8Array(buffer));

    const t2 = performance.now();
    LeanFs.logDebug("Compress", `${str.length} -> ${compressed.length} ` +`in ${(t2 - t1).toFixed(2)} ms`)
    return compressed;
}

async function decompressString(base64) {

    if(!decompressString.textDecoder){
        decompressString.textDecoder = new TextDecoder();
    }

    const t1 = performance.now();
    const bytes = base64ToUint8(base64);

    const stream = new Blob([bytes])
        .stream()
        .pipeThrough(new DecompressionStream('gzip'));

    const buffer = await new Response(stream).arrayBuffer();
    const decompressed = decompressString.textDecoder.decode(buffer);

    const t2 = performance.now();
    LeanFs.logDebug("Decompress", `${base64.length} -> ${decompressed.length} ` +`in ${(t2 - t1).toFixed(2)} ms`)

    return decompressed;
}

// === Hash helper === //

function bufferToHex(buffer) {
  return [...new Uint8Array(buffer)]
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

async function getStringHash(content){
    if(!getStringHash.textEncoder){
        getStringHash.textEncoder = new TextEncoder();
    }

    const data = getStringHash.textEncoder.encode(content ?? "");
    const hashBuffer = await window.crypto.subtle.digest("SHA-1", data);
    const newHash = bufferToHex(hashBuffer);
    return newHash;
}

function buildUuidIndexMap(items) {
    const map = Object.create(null);
    let i = 0;

    for (const uuid of Object.keys(items)) {
        map[uuid] = i++;
    }

    return map;
}

function mapChildrenUuidToIndex(children, uuidToIndex) {
    if (!Array.isArray(children)) return null;

    const out = new Array(children.length);

    for (let i = 0; i < children.length; i++) {
        const uuid = children[i];
        out[i] = uuidToIndex[uuid] ?? null; // null if missing
    }

    return out;
}

function mapChildrenIndexToUuid(childrenIdx, uuidToIndex) {
    if (!Array.isArray(childrenIdx)) return null;

    const out = new Array(childrenIdx.length);

    /// Create reserve map from index to uuid for reverse lookup
    const indexToUuid = Object.create(null);
    for (const uuid in uuidToIndex) {
        indexToUuid[uuidToIndex[uuid]] = uuid;
    }

    for (let i = 0; i < childrenIdx.length; i++) {
        out[i] = indexToUuid[childrenIdx[i]] ?? null;
    }

    return out;
}