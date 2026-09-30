import jsyaml from 'js-yaml';
import transform from 'lodash/transform';
import isEqual from 'lodash/isEqual';
import isObject from 'lodash/isObject';
import defaultsDeep from 'lodash/defaultsDeep';
import YAML from 'yaml';

export class IdeConfig{
    #CoreConfig = null;
    #UserConfig = null;
    #LocalConfig = null;
    #IDEConfig = null;

    #leanfs = null;
    static #LocalConfigFileName = "IDELocalConfig";

    constructor(leanfs) {
        // Enforce to always create New Object
        if (!new.target) {
            throw new Error("Config must be called with 'new'");
        }

        this.#leanfs = leanfs;
    }
    
    async getIDEConfig(){
        try{
            // ==== Recover IDEConfig From local file ==== //
            this.#CoreConfig = await this.#loadConfigFromURL('./IDECoreConfig.yaml');
            this.#UserConfig = await this.#loadConfigFromURL('./IDEUserConfig.yaml');

            const LocalConfigFile = await this.#loadLocalConfig();

            this.#LocalConfig = await this.#loadConfigFromText(LocalConfigFile ?? "");

            // ==== Update Config from URL url.searchParams ==== //
            let url = new URL(window.location.href);

            // Read optional configuration overrides from URL query parameters.
            // Only apply values that are explicitly present in the URL.
            // These overrides will later be merged on top of the ide config (without change the file).

            const UrlParamsConfig = queryToObject(url.searchParams);

            this.#LocalConfig = await this.#updateLocalConfig(UrlParamsConfig); // URL overrides LOCAL

            this.#IDEConfig =  defaultsDeep({}, this.#CoreConfig.config, this.#LocalConfig.config, this.#UserConfig.config);
            // console.log(this.#IDEConfig);

            // === Final IDEConfig === //
            // console.log(this.#IDEConfig);
            return this.#IDEConfig;
        }
        catch(error){
            console.error('Config load failed:', error || "Undefined error");
            return null;
        }
    }

    async checkRenameItem(uuid, newDisplayName){

        if(!this.#leanfs.isDir(uuid))return false;
        if(this.#leanfs.getParent(uuid) != this.#leanfs.getRoot())return false;
        if(newDisplayName !== IdeConfig.#LocalConfigFileName)return false;

        // auto focus to local config file if created
        const localConfigUUID = this.#leanfs.getLocalConfigUUID();
        await this.#leanfs.linkFile(localConfigUUID, uuid); // link local config file to tree
        await this.#leanfs.rename(localConfigUUID, `${IdeConfig.#LocalConfigFileName}.yaml`);

        return true;
    }

    async checkDeleteItem(uuid){
        const localConfigUUID = this.#leanfs.getLocalConfigUUID();
        if(uuid === localConfigUUID)return true;

        const LocalConfigParent = this.#leanfs.getParent(localConfigUUID);

        // Local config file parent delete -> unlink first, so it cant be delete from local storage
        if (this.#leanfs.isDir(uuid) && uuid === LocalConfigParent) {
            await this.#leanfs.unlinkFile(localConfigUUID);  // unlink
        }

        return false;
    }

    // --------------------------Private---------------------------//

    async #loadConfigFromURL(url) {
        const response = await fetch(url, {cache: "no-store"});
        if (!response.ok) {
            throw new Error(`Load template failed: ${url} (HTTP ${response.status})`);
        }
        const configText = await response.text();
        const config = jsyaml.load(configText);
        return {config: config, configText: configText};
    }

    async #loadConfigFromText(configText){
        if(configText === "")return {config: null, configText: ""};
        const config = jsyaml.load(configText);
        return {config: config, configText: configText};
    }

    async #updateLocalConfig(UrlParamsConfig) {

        if (!UrlParamsConfig || Object.keys(UrlParamsConfig).length === 0) return this.#LocalConfig;

        const diff = difference(UrlParamsConfig, this.#LocalConfig.config);

        if (!diff || Object.keys(diff).length === 0) return this.#LocalConfig;

        const uuid = this.#leanfs.getLocalConfigUUID();

        const yamlString = await this.#leanfs.readFile(uuid);

        const doc = YAML.parseDocument(yamlString); 

        applyYamlPatch(diff, doc);

        const updatedYamlString = doc.toString();

        const updatedLocal = defaultsDeep({}, UrlParamsConfig, this.#LocalConfig.config);

        this.#LocalConfig = {config: updatedLocal, configText: updatedYamlString}  // update localConfig

        await this.#leanfs.writeFile(uuid, updatedYamlString); // save to yaml file

        return this.#LocalConfig;
    }

    async #loadLocalConfig(){
        const LocalConfigUUID = this.#leanfs.getLocalConfigUUID();
        const UserConfigText = this.#UserConfig?.configText ?? "";
        let LocalConfigFile = await this.#leanfs.readFile(LocalConfigUUID);

        if(!LocalConfigFile){ // local config not exits
            console.log("[LeanFs.loadTree] No Local config Found, auto create");
            await this.#leanfs.writeFile(LocalConfigUUID, UserConfigText);
        }

        return LocalConfigFile || UserConfigText;
    }
}

// Parse query string (url params) into nested objects
// ref: 
// + https://stackoverflow.com/questions/18651963/parse-query-string-into-nested-objects#:~:text=2%20Answers,value%20return%20result%20%7D%2C%20%7B%7D)%20%7D
// + https://developer.mozilla.org/en-US/docs/Web/API/URLSearchParams/forEach

function queryToObject(searchParams){

    const helper = (keys, value, nth) => {
        const key = keys.shift();
        if (!keys.length) return { [key]: value };
        else return { [key]: { ...nth[key], ...helper(keys, value, nth[key] || {}) } };
    }

    const result = {};

    searchParams.forEach((value, k) => {
        const keys = k.split('.');
        const key = keys.shift();

        result[key] = keys.length
            ? { ...result[key], ...helper(keys, value, result[key] || {}) }
            : value
    })

    return result;
}

// ref: https://gist.github.com/Yimiprod/7ee176597fef230d1451?permalink_comment_id=2569085
function difference(object, base) {
	function changes(object, base) {
		return transform(object, function(result, value, key) {
			if (!isEqual(value, base[key])) {
				result[key] = (isObject(value) && isObject(base[key])) ? changes(value, base[key]) : value;
			}
		});
	}
	return changes(object, base);
}

function applyYamlPatch(patch, doc, path = []) {

  for (const [key, value] of Object.entries(patch)) {

    const next = [...path, key];

    if (value && typeof value === 'object' && !Array.isArray(value)) {
      applyYamlPatch(value, doc, next);
    } else {
      doc.setIn(next, value);
    }

  }

}