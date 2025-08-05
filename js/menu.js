// Sidebar responsiva: abrir/fechar no mobile
const sidebar = document.getElementById('sidebar');
//inputs
const andarSelect = document.getElementById('andarSelect');
const categoriaSelect = document.getElementById('categoriaSelect');
const areaBuscaSelect = document.getElementById('areaBuscaSelect');
const areaBuscaList = document.getElementById('areaBuscaList');
//containers
const sidebarContent = document.getElementById('sidebar-content');
const andarContainer = document.getElementById('andar-container');
const categoriaContainer = document.getElementById('categoria-container');
const AreaBuscaContainer = document.getElementById('areaBuscaList-container');
const origemContainer = document.getElementById('origem-container');
const destinoContainer = document.getElementById('destino-container');
const navegarBtnContainer = document.getElementById('navegarBtn-container');

//botoes
const menuBtn = document.getElementById('menuBtn');
const btnCloseSideBar = document.getElementById('closeSidebar')
const menuAndarBtn = document.getElementById('menuPisosBtn');
const menuRotaBtn = document.getElementById('menuRotaBtn');

// Abre sidebar automaticamente em desktop
if (window.innerWidth < 600) {
    closeSidebar();
}

if(window.innerWidth > 600){
    showContainer(AreaBuscaContainer);
    showContainer(categoriaContainer);
}



// funcao utilitarias
function showContainer(container) {
    container.classList.remove('d-none')
}

function ocultarContainer(container) {
    container.classList.add('d-none')
}

function openSidebar() {
    sidebar.classList.add('open');
}

function closeSidebar() {
    sidebar.classList.remove('open');

    ocultarContainer(AreaBuscaContainer);
    ocultarContainer(andarContainer);
    ocultarContainer(categoriaContainer);
    ocultarContainer(navegarBtnContainer);
    ocultarContainer(origemContainer);
    ocultarContainer(destinoContainer);


    if (window.innerWidth <= 600) {
        menuBtn.style.display = 'block'; // Mostra o botão ao fechar
    }
}
function ocultarButtons(){
    ocultarContainer(menuAndarBtn);
    ocultarContainer(menuRotaBtn);
    ocultarContainer(menuBtn);
}

function showButtons(){
    showContainer(menuAndarBtn);
    showContainer(menuBtn);
    showContainer(menuRotaBtn);
}

//Eventos

//Eventos de clique
menuAndarBtn.onclick = () => {
    openSidebar();
    ocultarButtons();
    showContainer(andarContainer);
};

menuBtn.onclick = () => {
    sidebar.classList.toggle('open');
    showContainer(AreaBuscaContainer);
    showContainer(categoriaContainer);

    if (sidebar.classList.contains('open')) {
        ocultarButtons();
    }
};

menuRotaBtn.onclick = () => {
    ocultarButtons();

    openSidebar();

    showContainer(origemContainer);
    showContainer(destinoContainer);
    showContainer(navegarBtnContainer);
    
};

btnCloseSideBar.onclick = () => {
    closeSidebar();
    showContainer(menuAndarBtn);
    showContainer(menuBtn);
    showContainer(menuRotaBtn);
};


//Eventos de listener
categoriaSelect.addEventListener('change', function () {
    closeSidebar();
    showButtons();
});

andarSelect.addEventListener('change', function () {
    closeSidebar();
    showButtons();
});

// Função para verificar se o valor está no datalist
function valorEhValido(valor, datalist) {
    return Array.from(datalist.options).some(opt => opt.value === valor);
}

areaBuscaSelect.addEventListener('change', function () {
    const valorSelecionado = areaBuscaSelect.value;
    if (valorEhValido(valorSelecionado, areaBuscaList)) {
        closeSidebar();
        showButtons();
    }
});