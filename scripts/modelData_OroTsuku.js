const DATA_URL = "./data/topics.json";
const TOPICS_DATA_URL = "./data/topics.json";
const MODEL_DATA_URL = "./data/model.json";

window.fetchData = async function () {
    const response = await fetch(DATA_URL);

    if (!response.ok){
        throw new Error(`Failed to load ${DATA_URL}`);
    }

    const data = await response.json();
    return data;
}