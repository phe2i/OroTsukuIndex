// const DATA_URL = "./data/topics.json";
const TOPICS_DATA_URL = "./data/topics.json";
const MODEL_DATA_URL = "./data/model.json";

window.fetchData = async function () {

    const [topicsResponse, modelResponse] = await Promise.all([
        fetch(TOPICS_DATA_URL),
        fetch(MODEL_DATA_URL)
    ]);

    if (!topicsResponse.ok) {
        throw new Error(`Failed to load ${TOPICS_DATA_URL}`);
    }
    if (!modelResponse.ok) {
        throw new Error(`Failed to load ${MODEL_DATA_URL}`);
    }

    const topicsData = await topicsResponse.json();
    const modelData = await modelResponse.json();

    // Combine: major = topics.json 
    const characterModelGroups = new Map();
    for (const group of modelData.characterModels || []) {
        const key = `${group.character}::${group.keyname}`;

        characterModelGroups.set(key, group);
    }
    for (const group of topicsData.characterModels || []) {
        const key = `${group.character}::${group.keyname}`;
        characterModelGroups.set(key, group);
    }

    const data = {
        ...topicsData,
        characterModels: Array.from(
            characterModelGroups.values()
        )
    };
    return data;
}