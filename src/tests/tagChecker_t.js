import TagChecker from "../ctrl/tagChecker";

function tagCheckerTest(building, doors, features, sitAnalyzer){
    let testBuilding = building;
    var testDoors=doors;
    var testFeatures=features;
    testBuilding.properties.tags.min_level="-9"; //should yield mintag: --9 --> can be caprured as error
    testBuilding.properties.tags.max_level="3"; //should yield a max: false --> can be captured as error
    testBuilding.properties.tags.building = "abc$";//should yield building: true tag: abc$ --> can be captured as error
    testBuilding.properties.tags.non_existent_levels="1";//should yield 
    testDoors[0].properties.tags.door="abc123";
    testFeatures[0].properties.tags.level="a";
    delete testFeatures[1].properties.tags.level;
    testFeatures[2].properties.tags.level="1000";
    testFeatures[3].properties.tags.level="1";
    testFeatures[3].properties.tags.repeat_on="1";
    var tagChecker = new TagChecker(testBuilding);
    var buildingErrors = tagChecker.checkBuilding();
    var nonExisting = tagChecker.checkNonExistingLevel();
    var doors2 = tagChecker.checkDoors(testDoors);
    var minmax = tagChecker.checkMinMaxLevel();
    var levels = tagChecker.checkLevel(testFeatures);
    sitAnalyzer.checkTagsForSIT(testBuilding);
    console.log(building);

    console.log("tag checking tests ......................................................")
    console.log(testBuilding.id);
    console.log(buildingErrors);
    console.log(doors2);
    console.log(minmax);
    console.log(nonExisting);
    console.log(levels);
    console.log("tag checking tests end ..................................................")
}

export {tagCheckerTest};