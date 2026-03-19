let topics = []
let orochiList = []
let tsukuList = []

let orochiMap = {}
let tsukuMap = {}

let pairKeys = []

const games = ["Turn-Based", "The Card Game", "Arena", "Yokai Koya"]

async function loadData(){
    const res = await fetch("./data/topics.json")
    topics = await res.json()

    topics.sort((a, b) => {
        const indexA = games.indexOf(a.source)
        const indexB = games.indexOf(b.source)
        // others
        const safeA = indexA === -1 ? Infinity : indexA
        const safeB = indexB === -1 ? Infinity : indexB

        return safeA - safeB
    })


    orochiList = topics.filter(t => t.character === "Orochi")
    tsukuList = topics.filter(t => t.character === "Tsukuyomi")

    for(const o of orochiList){
        if(!orochiMap[o.keyname]) orochiMap[o.keyname] = []
        orochiMap[o.keyname].push(o)
    }

    for(const t of tsukuList){
        if(!tsukuMap[t.keyname]) tsukuMap[t.keyname] = []
        tsukuMap[t.keyname].push(t)
    }

    pairKeys = Object.keys(orochiMap)
    .filter(k => tsukuMap[k])
    // console.log(pairKeys)

    setDefault()
    renderAllCards()
}
function randomL(list){
    return list[Math.floor(Math.random()*list.length)]
}

function display(card, data){
    if(!data) return

    const imgEl = document.getElementById(card+"Thumb")
    imgEl.src = data.thumbnail
    imgEl.dataset.images = JSON.stringify([
        data.thumbnail,
        data.full
    ])
    // document.getElementById(card+"Thumb").src = data.thumbnail
    document.getElementById(card+"EN").innerText = data.en
    document.getElementById(card+"CN").innerText = data.cn
    document.getElementById(card+"Source").innerText = data.source
}

function setDefault(){
    for(let o of orochiList){
        let match = tsukuList.find(t => t.keyname === o.keyname)
        if(match){

            display("orochi", o)
            display("tsuku", match)
            return
        }
    }
    randomPair()
}

function animateCard(id){
    const el = document.getElementById(id)
    el.classList.remove("card-animate")
    void el.offsetWidth
    el.classList.add("card-animate")
}

function randomPair(){

    const mode = document.querySelector('input[name="pairMode"]:checked')?.value
    let o,t

    if(mode === "ingame"){
        const oroList = orochiList.filter(t => games.includes(t.source))
        const tsuList = tsukuList.filter(t => games.includes(t.source))
        // console.log(oroList)
        // console.log(tsuList)
        o = randomL(oroList)
        t = randomL(tsuList)
    }
    else if(mode === "fixed"){
        const key = randomL(pairKeys)
        
        const oroList = orochiMap[key] || []
        const tsuList = tsukuMap[key] || []

        o = randomL(oroList)
        t = randomL(tsuList)
    }
    else if(mode === "diff"){
        o = randomL(orochiList)
        do{
            t = randomL(tsukuList)
        }while(o.keyname === t.keyname)
    }

    else{
        o = randomL(orochiList)
        t = randomL(tsukuList)
    }

    display("orochi", o)
    display("tsuku", t)

    animateCard("orochiCard")
    animateCard("tsukuCard")
}

document.getElementById("randomBtn")
.addEventListener("click", randomPair)

// img popup
const modal = document.getElementById("imageModal")
const modalImg = document.getElementById("modalImg")

let currentImages = []

function enableImagePopup(imgId){
    const img = document.getElementById(imgId)
    img.addEventListener("click", () => {
        
        currentImages = JSON.parse(img.dataset.images || "[]")
        if(currentImages[1]){
           modalImg.src = currentImages[1]
        }else{ modalImg.src = currentImages[0] }
        // modalImg.src = img.src
        modal.classList.remove("hidden")
        modal.classList.add("flex")
    })
}

enableImagePopup("orochiThumb")
enableImagePopup("tsukuThumb")

// close when clicking bg
modal.addEventListener("click", () => {
    modal.classList.remove("flex")
    modal.classList.add("hidden")
})


// random controller
// uncheckable
let lastChecked = null
document.querySelectorAll('input[name="pairMode"]').forEach(radio => {
    radio.addEventListener("click", function(){

        if(lastChecked === this){
            this.checked = false
            lastChecked = null
        }else{
            lastChecked = this
        }

    })
})

// view all
const allModal = document.getElementById("allModal")
document.getElementById("allBtn")

.addEventListener("click", () => {

    // renderAllCards()

    allModal.classList.remove("hidden")
    allModal.classList.add("flex")
})

function createCard(item){
    const div = document.createElement("div")
    div.className = "bg-slate-700 p-2 rounded text-center"

    const img = document.createElement("img")
    img.src = item.thumbnail
    img.className = "w-full rounded mb-2 cursor-pointer"

    img.addEventListener("click", () => {
        currentImg = [
            item.thumbnail,
            item.full || item.thumbnail
        ]
        modalImg.src = currentImg[1] || currentImg[0]

        modal.classList.remove("hidden")
        modal.classList.add("flex")
    })

    let name = ""
    if (item.en && !(item.en===item.cn)){
        name = item.cn + " / " + item.en
    }else{
        name = item.cn
    }
    div.innerHTML = `
        <p class="text-white text-sm">
            ${name}
        </p>
    `
    div.prepend(img)

    return div
}

function renderAllCards(){

    const oroSection = document.getElementById("oroSection")
    const tsukuSection = document.getElementById("tsukuSection")

    oroSection.innerHTML = ""
    tsukuSection.innerHTML = ""

    for(const t of topics){

        const card = createCard(t)

        if(t.character === "Orochi"){
            oroSection.appendChild(card)
        }else{
            tsukuSection.appendChild(card)
        }
    }
}

function toggleSection(id, h){
    const el = document.getElementById(id)
    el.classList.toggle("hidden")

    h.scrollIntoView()
}

// move to fn if want to close all at once
allModal.addEventListener("click", (e) => {
    if(e.target === allModal){
        allModal.classList.remove("flex")
        allModal.classList.add("hidden")
    }
})

loadData()
