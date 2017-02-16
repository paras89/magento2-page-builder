/**
 * - Build.js
 * Handles rebuilding the stage
 *
 * @author Dave Macaulay <dave@gene.co.uk>
 */
define([
    'underscore',
    'ko',
    'jquery',
    'bluefoot/config',
    'bluefoot/hook',
    'bluefoot/stage/panel/group/block'
], function (_, ko, jQuery, Config, Hook, Block) {

    /**
     * The build class handles building the stage with any previously saved content
     *
     * @constructor
     */
    function Build() {
        this.structure = false;
        this.stage = false;
    }

    /**
     * Parse the potential structure
     *
     * @param structure
     * @returns {boolean}
     */
    Build.prototype.parseStructure = function (structure) {
        var regex = new RegExp('<!--' + Config.getInitConfig('encode_string') + '="(.*?)"-->', 'g');

        try {
            // Test the expression first for performance
            if (regex.test(structure)) {
                regex.lastIndex = 0;
                var matches = regex.exec(structure);
                if (matches !== null && matches.length >= 2) {
                    var jsonConfig = JSON.parse(matches[1]);
                    if (typeof jsonConfig === 'object') {
                        this.structure = jsonConfig;
                        return jsonConfig;
                    }
                }
            }
        } catch (e) {
            return false;
        }

        return false;
    };

    /**
     * Build a stage from previous data
     *
     * @param stage
     */
    Build.prototype.buildStage = function (stage) {
        this.stage = stage;

        // Load in our entities
        // @todo loading state, wait to see if multiple instances are to be built
        Config.loadEntities(this.retrieveEntityIds(), false, function () {
            this.rebuild(this.structure);
        }.bind(this));
    };

    /**
     * Retrieve all entity ID's in the current configuration
     *
     * @returns {Array}
     */
    Build.prototype.retrieveEntityIds = function () {
        var entityIds = [];
        this._retrieveEntityIds(this.structure, entityIds);
        return entityIds;
    };

    /**
     * Function to recursively loop through entities
     *
     * @param entities
     * @param entityIds
     * @private
     */
    Build.prototype._retrieveEntityIds = function (entities, entityIds) {
        jQuery.each(entities, function (index, entity) {
            if (entity.entityId) {
                entityIds.push(entity.entityId);
                if (entity.children) {
                    jQuery.each(entity.children, function (name, children) {
                        this._retrieveEntityIds(children, entityIds);
                    }.bind(this));
                }
            } else {
                if (entity.children) {
                    this._retrieveEntityIds(entity.children, entityIds);
                }
            }
        }.bind(this));
    };

    /**
     * Rebuild the page builder contents
     *
     * @param structure
     *
     * @returns {boolean}
     */
    Build.prototype.rebuild = function (structure) {
        return this._rebuild(this._cleanupStructure(structure));
    };

    /**
     * Clean up structures
     *
     * @param structure
     * @private
     */
    Build.prototype._cleanupStructure = function (structure) {
        var newStructure = [];
        jQuery.each(structure, function (index, element) {
            // Reverse logic magic, ignore any extra data
            if (!(typeof element.type !== 'undefined' && element.type == 'extra')) {
                newStructure.push(element);
            }
        });
        return newStructure;
    };

    /**
     * Recursively rebuild the stage, the wait lock included within this function is to ensure that all content is built
     * in the correct order. As the way we build entities is handled by the stage we have no reliable way of waiting
     * for it to be finished
     *
     * @param entities
     * @param parent
     * @param elementBuiltFn
     * @returns {boolean}
     * @private
     */
    Build.prototype._rebuild = function (entities, parent, elementBuiltFn) {
        var completeTimeout;

        // Declare a function to be used as a callback when building entities
        var elementBuilt = function (entity, newParent) {
            // Grab the next entity to be built
            if (entities.length > 0) {
                var nextEntity = entities.shift();
                this._rebuildIndividual(nextEntity, parent, elementBuilt);
            } else {
                if (typeof elementBuiltFn === 'function') {
                    elementBuiltFn();
                } else {
                    clearTimeout(completeTimeout);
                    completeTimeout = setTimeout(function () {
                        this.stage.stageContent.valueHasMutated();
                        this.stage.loading(false);
                    }.bind(this), 250);
                }
            }
        }.bind(this);

        // Grab the next entity to be built
        var nextEntity = entities.shift();
        if (!parent) {
            parent = this.stage;
        }

        this._rebuildIndividual(nextEntity, parent, elementBuilt);
    };

    /**
     * Rebuild an individual entry
     *
     * @param entity
     * @param parent
     * @param elementBuiltFn
     * @returns {boolean}
     * @private
     */
    Build.prototype._rebuildIndividual = function (entity, parent, elementBuiltFn) {
        var newParent;
        if (entity && typeof entity.contentType !== 'undefined' && entity.contentType) {
            return this._rebuildContentType(entity, parent, elementBuiltFn);
        } else if (entity && typeof entity.type !== 'undefined' && entity.type) {
            if (entity.type == 'row' && typeof parent.addRow === 'function') {
                newParent = parent.addRow(this.stage, entity.formData);
            } else if (entity.type == 'column' && typeof parent.addColumn === 'function') {
                newParent = parent.addColumn(entity.formData);
            }

            if (typeof elementBuiltFn === 'function') {
                elementBuiltFn(entity, newParent);
            }

            if (entity.children && entity.children.length > 0) {
                return this._rebuild(entity.children, newParent, elementBuiltFn);
            }
        }
    };

    /**
     * Rebuild a content type
     *
     * @param entity
     * @param parent
     * @param callbackFn
     * @param key
     * @private
     */
    Build.prototype._rebuildContentType = function (entity, parent, callbackFn, key) {
        key = key || false;
        var blockConfig = Config.getContentTypeConfig(entity.contentType),
            blockInstance = new Block(blockConfig, false),
            blockData;

        if (typeof entity.formData === 'object' && !Array.isArray(entity.formData)) {
            blockData = jQuery.extend(entity.formData, Config.getEntity(entity.entityId));
        } else {
            blockData = Config.getEntity(entity.entityId);
        }

        // Insert a block via it's instance into the parent
        blockInstance.insert(parent, false, blockData, function (block) {
            if (entity.children && entity.children.length > 0) {
                jQuery.each(entity.children, function (key, children) {
                    jQuery.each(children, function (index, child) {
                        this._rebuildContentType(child, block, false, key);
                    }.bind(this));
                }.bind(this));
            }

            if (typeof callbackFn === 'function') {
                callbackFn(block, parent);
            }
        }.bind(this), key);
    };

    return Build;
});