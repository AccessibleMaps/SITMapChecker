let errorCodes = [
                    {
                        "code":                     "BFD-1",
                        "type":                     "error",
                        "taskDescription":          "Add width to each door",
                        "detailedTaskDescription":  "Each door needs a width to ensure that a wheelchair user can check if his wheelchair fits through the door",
                        "customDescription":        function(doorID) {return `Add a width tag to door ${doorId}`},
                        "featureIds":               []
                    },
                    {
                        "code":                     "SIT-4",
                        "type":                     "error",
                        "taskDescription":          "Place every element in building area",
                        "detailedTaskDescription":  "Each element should be located inside the building area",
                        "customDescription":        function(buildingPartId) {return `Building part ${buildingPartId} is not located inside the building`},
                        "featureIds":               []
                    },
                    {
                        "code":                     "SIT-5",
                        "type":                     "error",
                        "taskDescription":          "Building part level outside buildinglevel",
                        "detailedTaskDescription":  "Each level of the building part should be between the min & max level of the building",
                        "customDescription":        function(buildingPartId) {return `Building part ${buildingPartId} level is outside of min or max level of the building`},
                        "featureIds":               []
                    }
]
