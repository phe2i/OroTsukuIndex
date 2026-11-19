function toggleSection(id, h){
    const el = document.getElementById(id)
    const category = h.closest(".char-category")

    el.classList.toggle("hidden")
    category.classList.toggle("collapsed")

    h.scrollIntoView()
}