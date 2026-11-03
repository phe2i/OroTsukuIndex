
let topics = []
let orochiList = []
let tsukuList = []

let orochiMap = {}
let tsukuMap = {}

let pairKeys = []
let customPairs = []

const games = ["Turn-Based", "The Card Game", "Arena", "Yokai Koya"]

let currentOrochiData = null
let currentTsukuData = null

async function loadData(){
    const res = await fetch("./data/topics.json")
    const data = await res.json()

    topics = data.topics || []
    customPairs = data.customPair || []

    topics.sort((a, b) => {
        const indexA = games.indexOf(a.source)
        const indexB = games.indexOf(b.source)

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

    Object.keys(tsukuMap)
        .filter(k => orochiMap[k])
        .forEach(k => {
            pairKeys.push({
                name: k,
                orochiKey: k,
                tsukuKey: k
            })
        })

    for(const p of customPairs){
        if(orochiMap[p.orochiKey] && tsukuMap[p.tsukuKey]){
            pairKeys.push({
                name: p.name,
                orochiKey: p.orochiKey,
                tsukuKey: p.tsukuKey
            })
        }
    }

    setDefault()
    renderAllCards()

    enableImagePopup("orochiThumb")
    enableImagePopup("tsukuThumb")
}

function randomL(list){
    if(!list || list.length === 0) return null
    return list[Math.floor(Math.random() * list.length)]
}

function display(card, data){
    if(!data) return

    if(card === "orochi"){
        currentOrochiData = data
    } else if(card === "tsuku"){
        currentTsukuData = data
    }

    const imgEl = document.getElementById(card + "Thumb")

    imgEl.src = data.thumbnail

    imgEl.dataset.images = JSON.stringify([
        data.thumbnail,
        data.full
    ])

    document.getElementById(card + "EN").innerText = data.en
    document.getElementById(card + "CN").innerText = data.cn
    document.getElementById(card + "Source").innerText = data.source
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

    let o, t

    if(mode === "ingame"){
        const oroList = orochiList.filter(t => games.includes(t.source))
        const tsuList = tsukuList.filter(t => games.includes(t.source))

        o = randomL(oroList)
        t = randomL(tsuList)
    }
    else if(mode === "fixed"){
        const pair = randomL(pairKeys)
        if(!pair) return

        const oroList = orochiMap[pair.orochiKey] || []
        const tsuList = tsukuMap[pair.tsukuKey] || []

        o = randomL(oroList)
        t = randomL(tsuList)
    }
    else if(mode === "diff"){
        if(!orochiList.length || !tsukuList.length) return

        o = randomL(orochiList)

        const differentList = tsukuList.filter(
            item => item.keyname !== o.keyname
        )

        t = randomL(differentList)
    }
    else {
        o = randomL(orochiList)
        t = randomL(tsukuList)
    }

    if(!o || !t) return

    display("orochi", o)
    display("tsuku", t)

    animateCard("orochiCard")
    animateCard("tsukuCard")
}

document.getElementById("randomBtn")
    .addEventListener("click", randomPair)


// Modal in View All

const modal = document.getElementById("imageModal")
const modalImg = document.getElementById("modalImg")

const prevBtn = document.getElementById("prevBtn")
const nextBtn = document.getElementById("nextBtn")

const viewGalleryBtn = document.getElementById("viewGalleryBtn")
const galleryOverlay = document.getElementById("galleryOverlay")
const galleryGrid = document.getElementById("galleryGrid")
const galleryHeader = document.getElementById("galleryHeader")
const closeGalleryBtn = document.getElementById("closeGalleryBtn")

let currentModalList = []
let currentModalIndex = 0

function showModalWithData(data){
    if(!data) return

    currentModalList = topics.filter(
        t => t.character === data.character
    )

    currentModalIndex = currentModalList.indexOf(data)

    if(currentModalIndex === -1) return

    galleryOverlay.classList.add("hidden")
    updateModalContent()

    modal.classList.remove("hidden")
    modal.classList.add("flex")
}

function enableImagePopup(imgId){
    const img = document.getElementById(imgId)

    img.addEventListener("click", () => {
        let data

        if(imgId === "orochiThumb"){
            data = currentOrochiData
        } else if(imgId === "tsukuThumb"){
            data = currentTsukuData
        }
        
        if(!data) return

        showModalWithData(data)
    })
}

function getGalleryImages(topic){
    const images = []

    if(topic.full){
        images.push({
            src: topic.full,
            filename: "Main Image"
        })
    }

    if(Array.isArray(topic.otherImages)){
        topic.otherImages.forEach(image => {
            const imageData = typeof image === "string"
                ? {
                    src: image,
                    filename: image.split("/").pop()
                }
                : image

            if(imageData.src){
                images.push(imageData)
            }
        })
    }

    return images
}

function renderGallery(topic){
    const images = getGalleryImages(topic)

    viewGalleryBtn.textContent = `View Gallery (${images.length})`
    viewGalleryBtn.style.display = images.length > 1 ? "block" : "none"

    galleryOverlay.classList.add("hidden")
    galleryHeader.textContent = topic.cn + " / " + topic.en || "Image Gallery"

    galleryGrid.innerHTML = ""

    images.forEach((image, index) => {
        const item = document.createElement("button")

        item.type = "button"
        item.className = "gallery-item glow"

        const img = document.createElement("img")

        img.src = image.src
        img.alt = image.filename || `Image ${index + 1}`

        item.appendChild(img)

        item.addEventListener("click", () => {
            modalImg.src = image.src
            modalImg.alt = image.filename || `Image ${index + 1}`

            galleryOverlay.classList.add("hidden")
        })

        galleryGrid.appendChild(item)
    })
}

viewGalleryBtn.addEventListener("click", () => {
    if(viewGalleryBtn.classList.contains("hidden")) return

    galleryOverlay.classList.remove("hidden")
})

closeGalleryBtn.addEventListener("click", () => {
    galleryOverlay.classList.add("hidden")
})

function updateModalContent(){
    const data = currentModalList[currentModalIndex]

    if(!data) return

    modalImg.src = data.full || data.thumbnail
    modalImg.alt = data.en || data.cn || "Topic image"

    renderGallery(data)

    const releaseDate = document.getElementById("modalReleaseDate")

    releaseDate.innerText = data.releaseDate
        ? `Release: ${data.releaseDate}`
        : "Release: -"

    const links = document.getElementById("modalLinks")

    links.querySelectorAll(".topic-link-btn").forEach(el => el.remove());

    if(data.links && data.links.length > 0){
        data.links.forEach((link, index) => {
            const btn = document.createElement("a")

            btn.href = link.url
            btn.target = "_blank"
            btn.rel = "noopener noreferrer"
            btn.innerText = link.label
            btn.className = "small-btn topic-link-btn"

            btn.classList.add(
                index % 2 === 0 ? "btn1" : "btn2"
            )

            links.appendChild(btn)
        })
    }

    const hasMultipleTopics = currentModalList.length > 1
    prevBtn.hidden = !hasMultipleTopics
    nextBtn.hidden = !hasMultipleTopics
}

const downloadImgBtn = document.getElementById("downloadImgBtn")

downloadImgBtn.addEventListener("click", async () => {
    const imageUrl = modalImg.src
    if(!imageUrl) return

    try{
        const response = await fetch(imageUrl)

        if(!response.ok){
            throw new Error("Failed to fetch image")
        }
        const blob = await response.blob()
        const url = URL.createObjectURL(blob)

        const link = document.createElement("a")

        link.href = url
        link.download = modalImg.alt || "image"

        document.body.appendChild(link)
        link.click()
        link.remove()

        URL.revokeObjectURL(url)

    } catch (error){
        console.error("Download failed:", error)

        window.open(imageUrl, "_blank")
    }
})

prevBtn.addEventListener("click", () => {
    if(!currentModalList.length) return

    currentModalIndex =
        (currentModalIndex - 1 + currentModalList.length)
        % currentModalList.length

    updateModalContent()
})

nextBtn.addEventListener("click", () => {
    if(!currentModalList.length) return

    currentModalIndex =
        (currentModalIndex + 1) % currentModalList.length

    updateModalContent()
})

modal.addEventListener("click", (e) => {
    if(e.target === modal){
        modal.classList.remove("flex")
        modal.classList.add("hidden")

        galleryOverlay.classList.add("hidden")
    }
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

// View All

const allModal = document.getElementById("allModal")

document.getElementById("allBtn")
    .addEventListener("click", () => {
        allModal.classList.remove("hidden")
        allModal.classList.add("flex")
    })

function createCard(item){
    const div = document.createElement("div")

    div.className = "glow bg-slate-700 p-2 rounded text-center"

    const img = document.createElement("img")

    img.src = item.thumbnail
    img.className = "w-full rounded mb-2 cursor-pointer"

    img.addEventListener("click", () => {
        showModalWithData(item)
    })

    let name = ""

    if(item.en && !(item.en === item.cn)){
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
    const category = h.closest(".char-category")

    el.classList.toggle("hidden")
    category.classList.toggle("collapsed")

    h.scrollIntoView()
}

allModal.addEventListener("click", (e) => {
    if(e.target === allModal){
        allModal.classList.remove("flex")
        allModal.classList.add("hidden")
    }
})

loadData()
