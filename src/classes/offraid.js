"use strict";

class InraidServer {
  constructor() {
    // this needs to be saved on drive so if player closes server it can keep it going after restart
    this.players = {};
  }

  addPlayer(sessionID, info) {
    this.players[sessionID] = info;
  }
  getPlayer(sessionID) {
    return this.players[sessionID];
  }
  removePlayer(sessionID) {
    delete this.players[sessionID];
  }

  removeMapAccessKey(offraidData, sessionID) {
    if (typeof offraid_f.handler.getPlayer(sessionID) == "undefined") {
      logger.logWarning("Disabling: Remove map key on entering, cause of offraid_f.handler.players[sessionID] is undefined");
      return;
    }
    let map = global._database.locations[MapNameConversion(sessionID)].base;
    let mapKey = map.AccessKeys[0];

    if (!mapKey) {
      return;
    }

    for (let item of offraidData.profile.Inventory.items) {
      if (item._tpl === mapKey && item.slotId !== "Hideout") {
        let usages = -1;

        if (!helper_f.getItem(mapKey)[1]._props.MaximumNumberOfUsage) {
          usages = 1;
        } else {
          usages = "upd" in item && "Key" in item.upd ? item.upd.Key.NumberOfUsages : -1;
        }

        if (usages === -1) {
          item.upd = { Key: { NumberOfUsages: 1 } };
        } else {
          item.upd.Key.NumberOfUsages += 1;
        }

        if (item.upd.Key.NumberOfUsages >= helper_f.getItem(mapKey)[1]._props.MaximumNumberOfUsage) {
          move_f.removeItemFromProfile(offraidData.profile, item._id);
        }

        break;
      }
    }
  }
}

/* adds SpawnedInSession property to items found in a raid */
function markFoundItems(pmcData, profile, isPlayerScav) {
  // thanks Mastah Killah#1650
  // mark items found in raid
  for (let offraidItem of profile.Inventory.items) {
    let found = false;

    // mark new items for PMC and all items for scavs
    if (!isPlayerScav) {
      // check if the item exists in PMC inventory
      for (let item of pmcData.Inventory.items) {
        if (offraidItem._id === item._id) {
          // item found in PMC inventory
          found = true;
          // copy item previous FIR status
          if ("upd" in item && "SpawnedInSession" in item.upd) {
            // tests if offraidItem has the "upd" property. If it exists it copies the previous FIR status if not it creates a new "upd" property with that FIR status
            Object.getOwnPropertyDescriptor(offraidItem, "upd") !== undefined
              ? Object.assign(offraidItem.upd, { SpawnedInSession: item.upd.SpawnedInSession })
              : Object.assign(offraidItem, { upd: { SpawnedInSession: item.upd.SpawnedInSession } }); // overwrite SpawnedInSession value with previous item value or create new value
          }
          // FIR status not found - delete offraidItem's SpawnedInSession if it exists
          else if ("upd" in offraidItem && "SpawnedInSession" in offraidItem.upd) {
            delete offraidItem.upd.SpawnedInSession;
          }
          break;
        }
      }

      // skip to next item if found
      if (found) {
        continue;
      }
    }

    // item not found in PMC inventory, add FIR status to new item
    // tests if offraidItem has the "upd" property. If it exists it updates the FIR status if not it creates a new "upd" property
    Object.getOwnPropertyDescriptor(offraidItem, "upd") !== undefined
      ? Object.assign(offraidItem.upd, { SpawnedInSession: true })
      : Object.assign(offraidItem, { upd: { SpawnedInSession: true } });
  }
  return profile;
}

function RemoveFoundItems(profile) {
  for (let offraidItem of profile.Inventory.items) {
    // Remove the FIR status if the player died and the item marked FIR
    if ("upd" in offraidItem && "SpawnedInSession" in offraidItem.upd) {
      delete offraidItem.upd.SpawnedInSession;
    }

    continue;
  }

  return profile;
}

function setInventory(pmcData, profile) {
  move_f.removeItemFromProfile(pmcData, pmcData.Inventory.equipment);
  move_f.removeItemFromProfile(pmcData, pmcData.Inventory.questRaidItems);
  move_f.removeItemFromProfile(pmcData, pmcData.Inventory.questStashItems);

  // Bandaid fix to duplicate IDs being saved to profile after raid. May cause inconsistent item data. (~Kiobu)
  let duplicates = [];

  x: for (let item of profile.Inventory.items) {
    for (let key in pmcData.Inventory.items) {
      let currid = pmcData.Inventory.items[key]._id;
      if (currid == item._id) {
        duplicates.push(item._id);
        continue x;
      }
    }
    pmcData.Inventory.items.push(item);
  }
  pmcData.Inventory.fastPanel = profile.Inventory.fastPanel;

  // Don't count important stash IDs as errors.
  const stashIDs = ["60de0d80c6b34f52845b4646"];
  duplicates = duplicates.filter((x) => !stashIDs.includes(x));

  if (duplicates.length > 0) {
    logger.logWarning(`Duplicate ID(s) encountered in profile after-raid. Found ${duplicates.length} duplicates. Ignoring...`);
    logger.logWarning(`Duplicates: `);
    console.log(duplicates);
  }

  return pmcData;
}

function deleteInventory(pmcData, sessionID) {
  let toDelete = [];

  for (let item of pmcData.Inventory.items) {
    // remove normal item
    if (
      (item.parentId === pmcData.Inventory.equipment &&
        item.slotId !== "SecuredContainer" &&
        item.slotId !== "Scabbard" &&
        item.slotId !== "Pockets" &&
        item.slotId !== "Compass") ||
      item.parentId === pmcData.Inventory.questRaidItems
    ) {
      toDelete.push(item._id);
    }

    // remove pocket insides
    if (item.slotId === "Pockets") {
      for (let pocket of pmcData.Inventory.items) {
        if (pocket.parentId === item._id) {
          toDelete.push(pocket._id);
        }
      }
    }
  }

  // delete items
  for (let item of toDelete) {
    move_f.removeItemFromProfile(pmcData, item);
  }

  pmcData.Inventory.fastPanel = {};
  return pmcData;
}

function MapNameConversion(sessionID) {
  // change names to thenames of location file names that are loaded like that into the memory
  let playerRaidData = offraid_f.handler.getPlayer(sessionID);
  switch (playerRaidData.Location) {
    case "Customs":
      return "bigmap";
    case "Factory":
      if (playerRaidData.Time == "CURR") return "factory4_day";
      else return "factory4_night";
    case "Interchange":
      return "interchange";
    case "Laboratory":
      return "laboratory";
    case "ReserveBase":
      return "rezervbase";
    case "Shoreline":
      return "shoreline";
    case "Woods":
      return "woods";
    default:
      return playerRaidData.Location;
  }
}

function getPlayerGear(items) {
  // Player Slots we care about
  const inventorySlots = [
    "FirstPrimaryWeapon",
    "SecondPrimaryWeapon",
    "Holster",
    "Headwear",
    "Earpiece",
    "Eyewear",
    "FaceCover",
    "ArmorVest",
    "TacticalVest",
    "Backpack",
    "pocket1",
    "pocket2",
    "pocket3",
    "pocket4",
    "SecuredContainer",
  ];

  let inventoryItems = [];

  // Get an array of root player items
  for (let item of items) {
    if (inventorySlots.includes(item.slotId)) {
      inventoryItems.push(item);
    }
  }

  // Loop through these items and get all of their children
  let newItems = inventoryItems;
  while (newItems.length > 0) {
    let foundItems = [];

    for (let item of newItems) {
      // Find children of this item
      for (let newItem of items) {
        if (newItem.parentId === item._id) {
          foundItems.push(newItem);
        }
      }
    }

    // Add these new found items to our list of inventory items
    inventoryItems = [...inventoryItems, ...foundItems];

    // Now find the children of these items
    newItems = foundItems;
  }

  return inventoryItems;
}

function getSecuredContainer(items) {
  // Player Slots we care about
  const inventorySlots = ["SecuredContainer"];

  let inventoryItems = [];

  // Get an array of root player items
  for (let item of items) {
    if (inventorySlots.includes(item.slotId)) {
      inventoryItems.push(item);
    }
  }

  // Loop through these items and get all of their children
  let newItems = inventoryItems;

  while (newItems.length > 0) {
    let foundItems = [];

    for (let item of newItems) {
      for (let newItem of items) {
        if (newItem.parentId === item._id) {
          foundItems.push(newItem);
        }
      }
    }

    // Add these new found items to our list of inventory items
    inventoryItems = [...inventoryItems, ...foundItems];

    // Now find the children of these items
    newItems = foundItems;
  }

  return inventoryItems;
}

function saveProgress(offraidData, sessionID) {
  if (!global._database.gameplayConfig.inraid.saveLootEnabled) {
    return;
  }
  const isPlayerScav = offraidData.isPlayerScav;
  // Check for insurance if its enabled on this map
  if (typeof offraidData == "undefined") {
    logger.logError("offraidData: undefined");
    return;
  }
  if (typeof offraidData.exit == "undefined" || typeof offraidData.isPlayerScav == "undefined" || typeof offraidData.profile == "undefined") {
    logger.logError("offraidData: variables are empty... (exit, isPlayerScav, profile)");
    logger.logError(offraidData.exit);
    logger.logError(offraidData.isPlayerScav);
    logger.logError(offraidData.profile);
    return;
  }

  let pmcData = profile_f.handler.getPmcProfile(sessionID);

  if (offraidData.exit === "survived") {
    // mark found items and replace item ID's if the player survived
    offraidData.profile = markFoundItems(pmcData, offraidData.profile, isPlayerScav);
  } else {
    //Or remove the FIR status if the player havn't survived
    offraidData.profile = RemoveFoundItems(offraidData.profile);
  }

  if (isPlayerScav) {
    let scavData = profile_f.handler.getScavProfile(sessionID);
    scavData = setInventory(scavData, offraidData.profile, sessionID, true);
    health_f.handler.initializeHealth(sessionID);
    profile_f.handler.setScavProfile(sessionID, scavData);
    return;
    // ENDING HERE IF SCAV PLAYER !!!!
  }

  pmcData.Info.Level = offraidData.profile.Info.Level;
  pmcData.Skills = offraidData.profile.Skills;
  pmcData.Stats = offraidData.profile.Stats;
  pmcData.Encyclopedia = offraidData.profile.Encyclopedia;
  pmcData.ConditionCounters = offraidData.profile.ConditionCounters;
  pmcData.Quests = offraidData.profile.Quests;

  // For some reason, offraidData seems to drop the latest insured items.
  // It makes more sense to use pmcData's insured items as the source of truth.
  offraidData.profile.InsuredItems = pmcData.InsuredItems;

  // add experience points
  pmcData.Info.Experience += pmcData.Stats.TotalSessionExperience;
  pmcData.Stats.TotalSessionExperience = 0;

  // Remove the Lab card

  pmcData = setInventory(pmcData, offraidData.profile);
  health_f.handler.saveHealth(pmcData, offraidData.health, sessionID);

  // remove inventory if player died and send insurance items
  //TODO: dump of prapor/therapist dialogues that are sent when you die in lab with insurance.
  const systemMapName = MapNameConversion(sessionID);
  const insuranceEnabled = global._database.locations[systemMapName].base.Insurance;
  const preRaidGear = getPlayerGear(pmcData.Inventory.items);

  if (insuranceEnabled) {
    insurance_f.handler.storeLostGear(pmcData, offraidData, preRaidGear, sessionID);
  }
  if (offraidData.exit === "survived") {
    let exfils = profile_f.handler.getProfileExfilsById(sessionID);
    exfils[systemMapName] = exfils[systemMapName] + 1;
    profile_f.handler.setProfileExfilsById(sessionID, exfils);
  }
  if (offraidData.exit !== "survived" && offraidData.exit !== "runner") {
    if (insuranceEnabled) {
      insurance_f.handler.storeDeadGear(pmcData, offraidData, preRaidGear, sessionID);
    }
    pmcData = deleteInventory(pmcData, sessionID);
    //Delete carried quests items
    offraidData.profile.Stats.CarriedQuestItems = [];
  }
  if (insuranceEnabled) {
    insurance_f.handler.sendInsuredItems(pmcData, sessionID);
  }

  offraid_f.handler.removeMapAccessKey(offraidData, sessionID);
  offraid_f.handler.removePlayer(sessionID);
}

module.exports.handler = new InraidServer();
module.exports.saveProgress = saveProgress;
module.exports.getSecuredContainer = getSecuredContainer;
module.exports.getPlayerGear = getPlayerGear;
