const { Client } = require('pg')
const Sequelize = require('sequelize');
const { QueryTypes, Op } = require('sequelize');
const getDataType = require('./datatypes/getDataType');
const define = require('./define');
const { resolveMigrations } = require('./manager');
const collectionManager = require('./manager');
const Collection = require('./schema/collection');
const Config = require('./schema/config');
const {DataTypes} = Sequelize;

collectionManager.addWeblancerDataTypes(Sequelize);

let _sequelize;

let _models;

let _dbName;
let _dbUser;
let _dbPassword;
let _groupId;
let _dbHost;
let _dbPort;

async function initCollections (dbName, dbUser, dbPassword, groupId, dbHost, dbPort, updating) {
    console.log("initCollections 1")
    dbName = dbName.toLowerCase();

    _dbName = dbName;
    _dbUser = dbUser;
    _dbPassword = dbPassword;
    _groupId = groupId;
    _dbHost = dbHost;
    _dbPort = dbPort;

    // Creating db if not exist
    console.log("initCollections 2")
    try {
        let pgConfig = {
            user: dbUser,
            password: dbPassword,
        };
        dbHost && (pgConfig.host = dbHost);
        dbPort && (pgConfig.port = dbPort);
        const pgClient = new Client(pgConfig);
        await pgClient.connect();

        const isDbExist = async () => {
            let res = await pgClient.query(`SELECT FROM pg_database WHERE datname = '${dbName}'`);
            return res.rowCount > 0;
        }

        if (!await isDbExist()) {
            await pgClient
                .query(`CREATE DATABASE ${dbName}`);
        }

        console.log("initCollections 3")
        await pgClient.end();
        console.log("initCollections 4")
    } catch (error) {
        console.log("initCollections 5")
        return {
            success: false,
            error: "Can't connect to the database"
        }
    }
    // Creating db if not exist

    console.log("initCollections 6")
    let query = "SELECT * FROM collections";
    if (groupId) {
        query = `${query} WHERE groupId = '${groupId}'`
    }

    console.log("initCollections 7")
    _sequelize = new Sequelize(
        dbName,
        dbUser,
        dbPassword,
        {
            host:  "localhost",
            dialect: 'postgres'
        },
    );
    console.log("initCollections 8")

    let allCollections = [];
    try {
        allCollections = await _sequelize
            .query(`${query};`, { type: QueryTypes.SELECT });
    } catch (err) {
        console.log("error", err)
    }

    console.log("initCollections 9")
    console.log("allCollections", allCollections.length)
    let modelMap = {};
    let newAllCollections = JSON.parse(JSON.stringify(allCollections));
    for(const collection of newAllCollections) {
        modelMap[collection.name] =
            define(_sequelize, collection.name, collection.schema, collection.relation);
    }

    _models = {
        collection: Collection(_sequelize, DataTypes),
        config: Config(_sequelize, DataTypes),
        ...modelMap
    };

    // Resolving assosiations
    let allModels = {};
    Object.values(_models).forEach(model => {
        allModels[model.name] = model;
    });
    Object.values(_models).forEach(model => {
        if (model.associate)
            model.associate(allModels);
    });
    // Resolving assosiations

    await _sequelize.sync();

    let success;
    let error;
    if (updating) {
        let {success:s, error:e} = await resolveMigrations(_sequelize);
        success = s;
        error = e;
    }

    _sequelize = new Sequelize(
        dbName,
        dbUser,
        dbPassword,
        {
            host:  "localhost",
            dialect: 'postgres',
            operatorsAliases: {
                $or: Op.or,
                $and: Op.and,
                $gt: Op.gt,
                $eq: Op.eq,
                $ne: Op.ne,
                $is: Op.is,
                $not: Op.not,
                $gte: Op.gte,
                $lt: Op.lt,
                $lte: Op.lte,
                $between: Op.between,
                $notBetween: Op.notBetween,
                $in: Op.in,
                $notIn: Op.notIn,
                $like: Op.like,
                $notLike: Op.notLike,
                $startsWith: Op.startsWith,
                $endsWith: Op.endsWith,
                $substring: Op.substring,
                $iLike: Op.iLike,
                $notILike: Op.notILike,
                $regexp: Op.regexp,
                $notRegexp: Op.notRegexp,
                $iRegexp: Op.iRegexp,
                $notIRegexpt: Op.notIRegexp,
                $any: Op.any,
                $col: Op.col
            }
        },
    );

    modelMap = {};
    newAllCollections = JSON.parse(JSON.stringify(allCollections));
    for(const collection of newAllCollections) {
        modelMap[collection.name] =
            define(_sequelize, collection.name, collection.schema, collection.relation);
    }

    _models = {
        collection: Collection(_sequelize, DataTypes),
        config: Config(_sequelize, DataTypes),
        ...modelMap
    };

    // Resolving assosiations
    allModels = {};
    Object.values(_models).forEach(model => {
        allModels[model.name] = model;
    });
    Object.values(_models).forEach(model => {
        if (model.associate)
            model.associate(allModels);
    });

    await _sequelize.sync();

    return {success, error, models: _models, sequelize: _sequelize};
}

async function initSandBox (sandbox) {
    try{
        console.log("initSandBox 1")
        try{
            let query = `SELECT "id", "key", "value" FROM "configs" AS "config" WHERE "config"."key" = 'sandBoxInitialized'`;
            let config = await _sequelize
                .query(`${query};`, { type: QueryTypes.SELECT });
            // let config = await _sequelize.models.config.findOne({
            //     where: { key: 'sandBoxInitialized' }
            // });

            console.log("initSandBox 2", config)
            if (config.length > 0)
                return {success: true};
        } catch (error) {
            console.log("initSandBox 3", error)
            return {
                success: false,
                error, errorStatusCode: 500
            }
        }

        console.log("initSandBox 4")

        for (const collection of (sandbox.collections || [])) {
            let query = `SELECT * FROM "collections" WHERE "collections"."name" = '${collection.name}'`;
            let collections = await _sequelize
                .query(`${query};`, { type: QueryTypes.SELECT });

            console.log("initSandBox 4.5", collection.name, collections);
            if (collections.length > 0) {
                continue;
            }
            let newCollection = {...collection};
            await _sequelize.models.collection.create(newCollection);
        }

        console.log("initSandBox 5")
        let {success, error} = await updateCollections();

        console.log("initSandBox 6")
        if (!success) {
            return {
                success: false,
                error, errorStatusCode: 500
            }
        }

        console.log("initSandBox 7")
        try {
            let keys =  Object.keys(sandbox);

            for (let i = 0; i < keys.length; i++) {
                if (keys[i] === "collections")
                    continue;

                let collectionName = keys[i];
                let collection = sandbox.collections.find(c => c.name === collectionName);

                if (!collection)
                    continue;

                let records = sandbox[collectionName];

                records.forEach(record => {
                    delete record.id;
                    let props = Object.keys(record);
                    for (const prop of props) {
                        if (!Object.keys(collection.schema).includes(prop)) {
                            delete record[prop];
                            continue;
                        }

                        // if (collection.schema[prop].weblancerType === "video" ||
                        //     collection.schema[prop].weblancerType === "audio" ||
                        //     collection.schema[prop].weblancerType === "image" ||
                        //     collection.schema[prop].weblancerType === "document" ||
                        //     collection.schema[prop].weblancerType === "object")
                        // {
                        //     record[prop] = JSON.stringify(record[prop]);
                        // }
                    }
                });

                console.log("initSandBox 7.5", records);
                await _sequelize.models[collectionName].bulkCreate(records, {
                    ignoreDuplicates: true
                });
            }

            console.log("initSandBox 8")
            await _sequelize.models.config.create({
                key: "sandBoxInitialized",
                value: {value: true}
            });

            console.log("initSandBox 9")
            return {success: true};
        } catch (error) {
            console.log("initSandBox error 1", error)
            return {success: false, error, errorStatusCode: 500};
        }
    } catch (error) {
        console.log("initSandBox error 2", error)
        return {success: false, error, errorStatusCode: 500};
    }
}

async function updateCollections() {
    return await initCollections(_dbName, _dbUser, _dbPassword, _groupId, _dbHost, _dbPort, true);
}

async function createCollection(name, displayName, description, groupId, metadata, isApp) {
    let checkName = async (name, tryTime = 1) => {
        try {
            let sameCollection = await models.instance.collection.findOne({
                where: {
                    name
                }
            });

            if (sameCollection) {
                if (!isApp) {
                    return false;
                }

                return `${name}_${tryTime}`;
            }

            return name;
        } catch(error) {
            console.log("route create error", error);
            return false;
        }
    }

    name = name.toLowerCase();

    let nameChecked = false;
    let tryTime = 1;
    while (!nameChecked) {
        let newName = await checkName(name, tryTime);

        if (!newName) {
            return {
                success: false,
                error: "Name is not acceptable, try another one",
                errorStatusCode: 409
            };
        }

        if (name === newName) {
            break;
        }

        tryTime++;
    }

    let newCollection = {
        name, displayName, description, groupId, metadata
    };

    newCollection.schema = {
        id : {
            weblancerType: "number",
            unique: true,
            autoIncrement: true,
            primaryKey: true,
            order: 0,
            name: "id",
            description: "This field generate automatically from weblancer",
        }
    };

    let newDbCollection = await models.instance.collection.create(newCollection);

    let {success, error} = await updateCollections();

    if (!success) {
        await newDbCollection.destroy();

        return {
            success: false,
            error
        }
    }

    return {
        success: true,
        collections: await models.instance.collection.findAll()
    };
}

async function updateCollection(collectionName, displayName, description, groupId, metadata) {
    let collection;
    try {
        collection = await models.instance.collection.findOne({
            where: {
                name: collectionName
            }
        })

        if (!collection) {
            return {
                success: false,
                error: "Collection not found",
                errorStatusCode: 404
            }
        }
    } catch (error) {
        return {
            success: false,
            error: error.message,
            errorStatusCode: 500
        }
    }

    // let newName = collection.name;
    // if (metadata.archive && !collection.metadata.archive) {
    //     newName += ("_" + makeid(8));
    // }

    await collection.update({
        // name: newName,
        displayName,
        description,
        groupId,
        metadata: {...collection.metadata, ...metadata}
    })

    return {
        success: true,
        collection
    }
}

async function getCollection(collectionName) {
    let collection;
    try {
        collection = await models.instance.collection.findOne({
            where: {
                name: collectionName
            }
        })

        if (!collection) {
            return {
                success: false,
                error: "Collection not found",
                errorStatusCode: 404
            }
        }
    } catch (error) {
        return {
            success: false,
            error: error.message,
            errorStatusCode: 500
        }
    }

    return {
        success: true,
        collection
    }
}

async function getAllCollections() {
    try {
        let collections = await models.instance.collection.findAll()

        return {
            success: true,
            collections
        }
    } catch (error) {
        return {
            success: false,
            error: error.message,
            errorStatusCode: 500
        }
    }
}

async function updateSchema(collectionName, schema) {
    let collection;
    try {
        collection = await models.instance.collection.findOne({
            where: {
                name: collectionName
            }
        })

        if (!collection) {
            return {
                success: false,
                error: "Collection not found",
                errorStatusCode: 404
            }
        }
    } catch (error) {
        return {
            success: false,
            error: error.message,
            errorStatusCode: 500
        }
    }

    let oldSchema = {...collection.schema};

    await collection.update({schema});

    let {success, error} = await updateCollections();

    if (!success) {
        await collection.update({schema: oldSchema});

        return {
            success: false,
            error
        }
    }

    return {
        success: true,
        collection
    }
}

async function addField(collectionName, name, key, type, description, options) {
    let collection;
    try {
        collection = await _sequelize.models.collection.findOne({
            where: {
                name: collectionName
            }
        });

        if (!collection) {
            return {
                success: false,
                error: "Collection not found",
                errorStatusCode: 404
            }
        }
    } catch (error) {
        return {
            success: false,
            error: error.message,
            errorStatusCode: 500
        }
    }

    if (!getDataType(type)) {
        return {
            success: false,
            error: "Type not found",
            errorStatusCode: 404
        }
    }

    let schema = JSON.parse(JSON.stringify(collection.schema));
    let oldSchema = {...schema};

    if (schema[key]) {
        return {
            success: false,
            error: "Key exist in collection, try another key",
            errorStatusCode: 409
        }
    }

    schema[key] = {
        name,
        description,
        options,
        weblancerType: type,
        order: Object.keys(schema).length
    }

    await collection.update({schema});

    let {success, error} = await updateCollections();

    if (!success) {
        await collection.update({schema: oldSchema});

        return {
            success: false,
            error
        }
    }

    return {
        success: true,
        collection
    }
}

async function updateField(collectionName, name, key, type, description, options) {
    let collection;
    try {
        collection = await models.instance.collection.findOne({
            where: {
                name: collectionName
            }
        })

        if (!collection) {
            return {
                success: false,
                error: "Collection not found",
                errorStatusCode: 404
            }
        }
    } catch (error) {
        return {
            success: false,
            error: error.message,
            errorStatusCode: 500
        }
    }

    if (!getDataType(type)) {
        return {
            success: false,
            error: "Type not found",
            errorStatusCode: 404
        }
    }

    let schema = JSON.parse(JSON.stringify(collection.schema));

    if (!schema[key]) {
        return {
            success: false,
            error: "Key not found",
            errorStatusCode: 404
        }
    }

    let oldSchemaKey = {...schema[key]};

    schema[key] = {
        type: getDataType(type),
        name,
        description,
        options,
        weblancerType: type
    }

    await collection.update({schema});

    let {success, error} = await updateCollections();

    if (!success) {
        schema[key] = {...oldSchemaKey};

        await collection.update({schema: {...schema}});

        return {
            success: false,
            error
        }
    }

    return {
        success: true,
        collection
    }
}

const sequelize = {
    get instance() {
        return _sequelize;
    }
};

const models = {
    get instance() {
        return _models;
    }
};

function makeid(length) {
    var result           = '';
    var characters       = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    var charactersLength = characters.length;
    for ( var i = 0; i < length; i++ ) {
        result += characters.charAt(Math.floor(Math.random() *
            charactersLength));
    }
    return result;
}

module.exports = {
    initCollections,
    sequelize,
    models,
    DataTypes,
    updateCollections,
    createCollection,
    updateCollection,
    getAllCollections,
    getCollection,
    updateSchema,
    addField,
    updateField,
    initSandBox
};
