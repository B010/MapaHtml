// mapa.js
// Carrega dados dos andares via API e inicializa o mapa
(async function carregarDadosMapa() {
  // Obtém o id do mapa da querystring da URL
  const params = new URLSearchParams(window.location.search);
  const mapaId = params.get("id") || "1"; // valor padrão caso não haja id
  const url = `https://SuperAppXrmh.controlxrm.com.br/Mapas/${mapaId}`;

  let response;
  try {
    response = await fetch(url);
    if (!response.ok) throw new Error("Erro ao buscar dados da API");
    window.andares = await response.json();
  } catch (e) {
    alert("Erro ao carregar dados do mapa: " + e.message);
    return;
  }
  inicializarMapa();

  function inicializarMapa() {
    const andarSelect = document.getElementById("andarSelect");
    const categoriaSelect = document.getElementById("categoriaSelect");
    // Sidebar responsiva: abrir/fechar no mobile
    const sidebar = document.getElementById("sidebar");
    const menuBtn = document.getElementById("menuBtn");
    const menuAndarBtn = document.getElementById("menuPisosBtn");
    const menuRotaBtn = document.getElementById("menuRotaBtn");

    function limparMarcadoresCategoria() {
      categoriaMarkers.forEach((m) => map.removeLayer(m));
      categoriaMarkers = [];
    }

    function limparEstilosDasAreas() {
      areaObjs.forEach((a) =>
        a.setStyle({ color: "transparent", weight: 3, dashArray: null }),
      );
    }

    const map = L.map("map", {
      crs: L.CRS.Simple,
      minZoom: -5,
      zoomControl: false,
    });

    // Acao para o btn de Rota
    map.on("popupopen", function (e) {
      const popupEl = e.popup.getElement();
      const rotaBtn = popupEl.querySelector(".popup-rota");

      if (rotaBtn) {
        rotaBtn.onclick = function () {
          const nomeLoja = popupEl.querySelector("b")?.innerText ?? "";
          const andarAtual = andares[currentAndarIdx].nome;
          const destinoFull = `${nomeLoja} [${andarAtual}]`;

          ocultarButtons();
          openSidebar();
          showContainer(document.getElementById("origem-container"));
          showContainer(document.getElementById("destino-container"));
          showContainer(document.getElementById("navegarBtn-container"));

          const inputDestino = document.getElementById("destino");
          inputDestino.value = destinoFull;
          inputDestino.dispatchEvent(new Event("input"));

          map.closePopup();
        };
      }
    });

    L.control.zoom({ position: "bottomright" }).addTo(map);
    let overlayImg = null;
    let areaObjs = [],
      polyObjs = {};
    let currentAndarIdx = 0;
    let currentGraph = null,
      currentNodes = null,
      currentSegmentos = null;
    let labelMarkers = [];
    const LABEL_ZOOM_THRESHOLD = 0;
    // teto de zoom ao enquadrar rota/filtro: evita "colar" na planta quando há
    // poucas áreas ou elas estão muito próximas
    const ZOOM_MAX_FOCO = 0;
    let routeMarkers = [];
    let routeLine = null;
    // Trechos da rota atual: 1 quando é no mesmo andar, 2 quando passa por
    // elevador/escada. O usuário escolhe qual trecho quer ver.
    let trechosRota = [];
    let categoriaMarkers = [];

    function desenharAndar(idx) {
      const andar = andares[idx];
      currentAndarIdx = Number(idx);
      currentSegmentos = andar.segmentos;
      currentNodes = getUniqueNodes(currentSegmentos);
      currentGraph = buildGraph(currentSegmentos, currentNodes);
      if (overlayImg) map.removeLayer(overlayImg);
      if (routeLine) {
        map.removeLayer(routeLine);
        routeLine = null;
      }
      overlayImg = L.imageOverlay(andar.imagem, andar.bounds).addTo(map);
      map.setMaxBounds(andar.bounds);
      map.fitBounds(andar.bounds);
      areaObjs.forEach((a) => map.removeLayer(a));
      Object.values(polyObjs).forEach((p) => map.removeLayer(p));
      areaObjs = [];
      polyObjs = {};
      labelMarkers = [];
      andar.areas.forEach((a) => {
        const corArea = a.cor || "#4fa3e3";
        const area = L.polygon(a.coord, {
          color: corArea,
          weight: 2,
          fillColor: corArea,
          fillOpacity: 0.35,
        }).addTo(map);
        area.corOriginal = corArea;
        area.on("click", function () {
          map.closePopup();
          areaObjs.forEach((a2) =>
            a2.setStyle({ color: a2.corOriginal, weight: 2, dashArray: null }),
          );
          area.setStyle({ color: "red", weight: 3, dashArray: null });
          map.setView(a.label, map.getZoom(), { animate: true });
          L.popup({ className: "custom-popup" })
            .setLatLng(a.label)
            .setContent(
              `
                <div class="popup-content">
                  <img src="${a.icon}" class="popup-icon" alt="Ícone">
                  <div><b>${a.nome}</b><br>${a.popup || ""}<br>
                    <span class="popup-rota" style="color:#0070d1;cursor:pointer;font-weight:bold;">ROTA</span>
                  </div>
                </div>
              `,
            )
            .openOn(map);
        });
        areaObjs.push(area);
        labelMarkers.push(
          L.marker(a.label, {
            icon: L.divIcon({
              className: "label",
              html: `<b>${a.nome}</b>`,
              iconSize: [80, 20],
            }),
            interactive: false,
          }),
        );
      });
      andar.segmentos.forEach((seg) => {
        const poly = L.polyline([seg.a, seg.b], {
          color: "#bbb",
          weight: 4,
          opacity: 0,
          interactive: false,
        }).addTo(map);
        polyObjs[seg.id] = poly;
      });
      updateLabelsVisibility();
      // se a rota atual tem um trecho neste andar, redesenha automaticamente
      if (trechosRota.length) desenharTrechoDoAndarAtual();
    }

    function updateLabelsVisibility() {
      const show = map.getZoom() >= LABEL_ZOOM_THRESHOLD;
      labelMarkers.forEach((label) => {
        if (show) {
          if (!map.hasLayer(label)) label.addTo(map);
        } else {
          if (map.hasLayer(label)) map.removeLayer(label);
        }
      });
    }

    map.on("zoomend", updateLabelsVisibility);

    andarSelect.onchange = function () {
      if (overlayImg) map.removeLayer(overlayImg);
      areaObjs.forEach((a) => map.removeLayer(a));
      Object.values(polyObjs).forEach((p) => map.removeLayer(p));
      routeMarkers.forEach((m) => map.removeLayer(m));
      routeMarkers = [];
      limparMarcadoresCategoria();
      areaObjs = [];
      polyObjs = {};
      desenharAndar(this.value);
    };
    desenharAndar(0);

    function dist(a, b) {
      return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2);
    }
    function getUniqueNodes(segmentos) {
      const nodes = [];
      segmentos.forEach((seg) => {
        if (!nodes.some((n) => n[0] === seg.a[0] && n[1] === seg.a[1]))
          nodes.push(seg.a);
        if (!nodes.some((n) => n[0] === seg.b[0] && n[1] === seg.b[1]))
          nodes.push(seg.b);
      });
      return nodes;
    }
    function buildGraph(segmentos, nodes) {
      const graph = {};
      nodes.forEach((n) => (graph[nodeKey(n)] = []));
      segmentos.forEach((seg) => {
        const aKey = nodeKey(seg.a);
        const bKey = nodeKey(seg.b);
        const custo = dist(seg.a, seg.b);
        graph[aKey].push({ to: bKey, segId: seg.id, custo });
        graph[bKey].push({ to: aKey, segId: seg.id, custo });
      });
      return graph;
    }
    function nodeKey(pt) {
      return pt[0] + "," + pt[1];
    }
    function nearestNode(pt, nodes) {
      let min = Infinity,
        nearest = null;
      nodes.forEach((n) => {
        const d = dist(pt, n);
        if (d < min) {
          min = d;
          nearest = n;
        }
      });
      return nearest;
    }
    // Grafo de cada andar, construído sob demanda e reaproveitado.
    const cacheAndares = {};
    function dadosDoAndar(idx) {
      if (!cacheAndares[idx]) {
        const segmentos = andares[idx].segmentos;
        const nodes = getUniqueNodes(segmentos);
        cacheAndares[idx] = {
          segmentos,
          nodes,
          graph: buildGraph(segmentos, nodes),
        };
      }
      return cacheAndares[idx];
    }
    function dijkstra(graph, startKey, endKey, segmentos) {
      const distancias = {},
        prev = {},
        visited = new Set(),
        queue = [];
      Object.keys(graph).forEach((k) => (distancias[k] = Infinity));
      distancias[startKey] = 0;
      queue.push({ key: startKey, dist: 0 });
      while (queue.length) {
        queue.sort((a, b) => a.dist - b.dist);
        const { key } = queue.shift();
        if (visited.has(key)) continue;
        visited.add(key);
        if (key === endKey) break;
        graph[key].forEach(({ to, segId, custo }) => {
          if (visited.has(to)) return;
          const alt = distancias[key] + custo;
          if (alt < distancias[to]) {
            distancias[to] = alt;
            prev[to] = { from: key, segId };
            queue.push({ key: to, dist: alt });
          }
        });
      }
      let path = [];
      let u = endKey;
      while (prev[u]) {
        path.unshift(prev[u].segId);
        u = prev[u].from;
      }
      const caminho = path.map((id) => segmentos.find((s) => s.id === id));
      caminho.custo = distancias[endKey];
      return caminho;
    }
    // Caminho dentro de um andar específico (por padrão, o que está na tela).
    function buscarCaminho(origem, destino, andarIdx = currentAndarIdx) {
      const { graph, nodes, segmentos } = dadosDoAndar(andarIdx);
      const startKey = nodeKey(nearestNode(origem, nodes));
      const endKey = nodeKey(nearestNode(destino, nodes));
      return dijkstra(graph, startKey, endKey, segmentos);
    }
    // Custo real de caminhada (percorrendo o grafo), não distância em linha reta.
    function custoCaminhada(origem, destino, andarIdx) {
      const caminho = buscarCaminho(origem, destino, andarIdx);
      const custo = caminho.custo;
      return custo === undefined || !isFinite(custo) ? Infinity : custo;
    }
    // Converte a lista de segmentos do dijkstra numa sequência contínua de pontos,
    // orientando cada segmento conforme o ponto anterior.
    function caminhoParaPontos(caminho) {
      if (!caminho || !caminho.length) return [];
      const pts = [];
      let atual;
      if (caminho.length === 1) {
        atual = caminho[0].a;
        pts.push(caminho[0].a, caminho[0].b);
        return pts;
      }
      const primeiro = caminho[0],
        segundo = caminho[1];
      const tocaSegundo = (p) =>
        nodeKey(p) === nodeKey(segundo.a) || nodeKey(p) === nodeKey(segundo.b);
      // o ponto do primeiro segmento que NÃO encosta no segundo é a origem
      atual = tocaSegundo(primeiro.b) ? primeiro.a : primeiro.b;
      pts.push(atual);
      caminho.forEach((seg) => {
        const proximo = nodeKey(seg.a) === nodeKey(atual) ? seg.b : seg.a;
        pts.push(proximo);
        atual = proximo;
      });
      return pts;
    }

    // Agrupa sequências de coordenadas quase iguais (trechos que deveriam ser retos)
    // e substitui todas pela média do grupo, eliminando o "serrilhado".
    function alinharQuaseRetas(pts, tol) {
      if (pts.length < 3) return pts.map((p) => [p[0], p[1]]);
      const out = pts.map((p) => [p[0], p[1]]);
      for (const eixo of [0, 1]) {
        let ini = 0;
        for (let i = 1; i <= out.length; i++) {
          const dentro =
            i < out.length && Math.abs(out[i][eixo] - out[ini][eixo]) <= tol;
          if (!dentro) {
            if (i - ini > 1) {
              let soma = 0;
              for (let j = ini; j < i; j++) soma += out[j][eixo];
              const media = soma / (i - ini);
              for (let j = ini; j < i; j++) out[j][eixo] = media;
            }
            ini = i;
          }
        }
      }
      return out;
    }

    // Remove pontos redundantes: duplicados e vértices praticamente colineares.
    function limparPontos(pts, tolArea) {
      const out = [];
      pts.forEach((p) => {
        const ult = out[out.length - 1];
        if (!ult || dist(ult, p) > 1e-9) out.push(p);
      });
      if (out.length < 3) return out;
      const res = [out[0]];
      for (let i = 1; i < out.length - 1; i++) {
        const a = res[res.length - 1],
          b = out[i],
          c = out[i + 1];
        const area = Math.abs(
          (b[0] - a[0]) * (c[1] - a[1]) - (c[0] - a[0]) * (b[1] - a[1]),
        );
        if (area > tolArea) res.push(b);
      }
      res.push(out[out.length - 1]);
      return res;
    }

    // Arredonda SOMENTE as esquinas, com raio pequeno e fixo: as retas continuam
    // retas (nenhum ponto novo no meio delas) e o canto vira uma mini curva.
    function arredondarCantos(pts, raio) {
      if (pts.length < 3) return pts;
      const out = [pts[0]];
      for (let i = 1; i < pts.length - 1; i++) {
        const a = pts[i - 1],
          v = pts[i],
          b = pts[i + 1];
        const dA = dist(a, v),
          dB = dist(v, b);
        if (dA < 1e-9 || dB < 1e-9) continue;
        // nunca passa de 1/3 de cada lado, para não comer o segmento vizinho
        const r = Math.min(raio, dA / 3, dB / 3);
        const p1 = [
          v[0] + ((a[0] - v[0]) / dA) * r,
          v[1] + ((a[1] - v[1]) / dA) * r,
        ];
        const p2 = [
          v[0] + ((b[0] - v[0]) / dB) * r,
          v[1] + ((b[1] - v[1]) / dB) * r,
        ];
        // bezier quadrática curta: p1 -> (controle = esquina) -> p2
        const passos = 6;
        out.push(p1);
        for (let t = 1; t < passos; t++) {
          const u = t / passos,
            w = 1 - u;
          out.push([
            w * w * p1[0] + 2 * w * u * v[0] + u * u * p2[0],
            w * w * p1[1] + 2 * w * u * v[1] + u * u * p2[1],
          ]);
        }
        out.push(p2);
      }
      out.push(pts[pts.length - 1]);
      return out;
    }

    function suavizarRota(caminho) {
      let pts = caminhoParaPontos(caminho);
      if (pts.length < 2) return pts;
      // tolerância proporcional ao tamanho médio dos trechos
      let soma = 0;
      for (let i = 1; i < pts.length; i++) soma += dist(pts[i - 1], pts[i]);
      const passoMedio = soma / (pts.length - 1);
      const tol = Math.max(passoMedio * 0.35, 1e-6);
      pts = alinharQuaseRetas(pts, tol);
      pts = limparPontos(pts, tol * tol * 0.5);
      // raio na escala da malha (espaçamento dos nós), não do tamanho da rota:
      // aumente/diminua RAIO_CANTO para curvas maiores ou mais secas
      const RAIO_CANTO = passoMedio * 0.5;
      return arredondarCantos(pts, RAIO_CANTO);
    }

    function destacarCaminho(caminho, origem, destino) {
      Object.values(polyObjs).forEach((poly) =>
        poly.setStyle({ color: "#bbb", opacity: 0 }),
      );
      if (routeLine) {
        map.removeLayer(routeLine);
        routeLine = null;
      }
      const pontos = suavizarRota(caminho);
      if (pontos.length > 1) {
        const base = {
          lineJoin: "round",
          lineCap: "round",
          smoothFactor: 0,
          interactive: false,
        };
        // contorno branco por baixo, para a rota se destacar da planta colorida
        const contorno = L.polyline(pontos, {
          ...base,
          color: "#fff",
          weight: 11,
          opacity: 0.9,
        });
        const linha = L.polyline(pontos, {
          ...base,
          color: "orange",
          weight: 6,
          opacity: 1,
        });
        // tracejado animado por cima: indica o sentido origem -> destino
        const fluxo = L.polyline(pontos, {
          ...base,
          color: "#fff",
          weight: 3,
          opacity: 0.95,
          dashArray: "10 16",
          className: "rota-fluxo",
        });
        routeLine = L.layerGroup([contorno, linha, fluxo]).addTo(map);
        contorno.bringToFront();
        linha.bringToFront();
        fluxo.bringToFront();
        map.fitBounds(linha.getBounds(), {
          padding: [60, 60],
          maxZoom: ZOOM_MAX_FOCO,
        });
      }
      routeMarkers.forEach((m) => map.removeLayer(m));
      routeMarkers = [];
      const origemIcon = L.icon({
        iconUrl:
          "https://www.svgrepo.com/show/308152/walking-person-go-walk-move.svg",
        iconSize: [32, 32],
        iconAnchor: [16, 32],
        popupAnchor: [0, -32],
      });
      if (origem) {
        const markerOrigem = L.marker(origem, {
          title: "Origem",
          icon: origemIcon,
        }).addTo(map);
        routeMarkers.push(markerOrigem);
      }
      if (destino) {
        const markerDestino = L.marker(destino, { title: "Destino" }).addTo(
          map,
        );
        routeMarkers.push(markerDestino);
      }
    }
    const navegarBtn = document.getElementById("navegarBtn");
    const mensagemEl = document.getElementById("mensagem");
    const passosContainer = document.getElementById("passos-container");
    const passosLista = document.getElementById("passosLista");

    // Mensagens no próprio sidebar, em vez de alert() (péssimo dentro do WebView).
    function mostrarMensagem(texto) {
      mensagemEl.textContent = texto;
      mensagemEl.classList.remove("d-none");
      openSidebar();
    }
    function limparMensagem() {
      mensagemEl.textContent = "";
      mensagemEl.classList.add("d-none");
    }

    function limparTrechos() {
      trechosRota = [];
      if (routeLine) {
        map.removeLayer(routeLine);
        routeLine = null;
      }
      routeMarkers.forEach((m) => map.removeLayer(m));
      routeMarkers = [];
      passosLista.innerHTML = "";
      ocultarContainer(passosContainer);
    }

    function renderPassos() {
      passosLista.innerHTML = "";
      if (trechosRota.length < 2) {
        ocultarContainer(passosContainer);
        return;
      }
      trechosRota.forEach((t, i) => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = "list-group-item list-group-item-action";
        if (t.andar === currentAndarIdx) item.classList.add("passo-ativo");
        item.innerHTML = `<strong>${i + 1}.</strong> ${t.titulo}<br><small class="text-muted">${andares[t.andar].nome}</small>`;
        item.onclick = () => irParaTrecho(i);
        passosLista.appendChild(item);
      });
      showContainer(passosContainer);
    }

    function irParaTrecho(i) {
      const t = trechosRota[i];
      if (!t) return;
      if (currentAndarIdx !== t.andar) {
        andarSelect.value = t.andar;
        desenharAndar(t.andar); // redesenha e já traça o trecho deste andar
      } else {
        desenharTrechoDoAndarAtual();
      }
    }

    // Chamada ao final de desenharAndar: se a rota atual tem um trecho neste
    // andar, ele aparece pronto — trocar de andar já mostra a rota certa.
    function desenharTrechoDoAndarAtual() {
      const t = trechosRota.find((tr) => tr.andar === currentAndarIdx);
      if (!t) {
        renderPassos();
        return;
      }
      const caminho = buscarCaminho(t.de, t.para, t.andar);
      destacarCaminho(caminho, t.de, t.para);
      renderPassos();
    }

    navegarBtn.onclick = () => {
      limparMarcadoresCategoria();
      limparMensagem();

      const origemInput = document.getElementById("origem").value;
      const destinoInput = document.getElementById("destino").value;
      const areaOrigem = findAreaByInput(origemInput);
      const areaDestino = findAreaByInput(destinoInput);
      if (!areaOrigem || !areaDestino) {
        limparTrechos();
        mostrarMensagem("Selecione áreas válidas para origem e destino.");
        return;
      }
      if (areaOrigem.andar === areaDestino.andar) {
        trechosRota = [
          {
            andar: areaOrigem.andar,
            de: areaOrigem.label,
            para: areaDestino.label,
            titulo: `${areaOrigem.nome} → ${areaDestino.nome}`,
          },
        ];
        if (currentAndarIdx !== areaOrigem.andar) {
          andarSelect.value = areaOrigem.andar;
          desenharAndar(areaOrigem.andar);
        } else {
          desenharTrechoDoAndarAtual();
        }
        renderPassos();
      } else {
        const transferOrigem =
          findNearestElevadorArea(areaOrigem.andar, areaOrigem.label) ||
          findNearestTransferArea(areaOrigem.andar, areaOrigem.label);
        const transferDestino =
          findNearestElevadorArea(areaDestino.andar, areaDestino.label) ||
          findNearestTransferArea(areaDestino.andar, areaDestino.label);
        if (!transferOrigem || !transferDestino) {
          limparTrechos();
          mostrarMensagem("Não há elevador ou escada em um dos andares.");
          return;
        }
        trechosRota = [
          {
            andar: areaOrigem.andar,
            de: areaOrigem.label,
            para: transferOrigem.label,
            titulo: `${areaOrigem.nome} → ${transferOrigem.nome}`,
          },
          {
            andar: areaDestino.andar,
            de: transferDestino.label,
            para: areaDestino.label,
            titulo: `${transferDestino.nome} → ${areaDestino.nome}`,
          },
        ];
        if (currentAndarIdx !== areaOrigem.andar) {
          andarSelect.value = areaOrigem.andar;
          desenharAndar(areaOrigem.andar);
        } else {
          desenharTrechoDoAndarAtual();
        }
        renderPassos();
      }
      // rota com troca de andar: mantém os passos à vista para o usuário navegar
      if (trechosRota.length > 1) {
        openSidebar();
        showContainer(passosContainer);
        return;
      }
      if (window.innerWidth <= 600) {
        closeSidebar();
        showContainer(menuRotaBtn);
        showContainer(menuAndarBtn);
        showContainer(menuBtn);
      } else {
        openSidebar();
        showContainer(categoriaContainer);
        showContainer(AreaBuscaContainer);
      }
    };

    function getAllAreasWithAndar() {
      const all = [];
      andares.forEach((andar, idx) => {
        andar.areas.forEach((area) => {
          all.push({
            nome: area.nome,
            andar: idx,
            andarNome: andar.nome,
            categoria: area.categoria,
            label: area.label,
          });
        });
      });
      return all;
    }
    function atualizarDatalistsGlobal() {
      const allAreas = getAllAreasWithAndar();
      const origemDatalist = document.getElementById("origemList");
      const destinoDatalist = document.getElementById("destinoList");
      origemDatalist.innerHTML = "";
      destinoDatalist.innerHTML = "";
      allAreas.forEach((a) => {
        const opt1 = document.createElement("option");
        opt1.value = `${a.nome} [${a.andarNome}]`;
        origemDatalist.appendChild(opt1);
        const opt2 = document.createElement("option");
        opt2.value = `${a.nome} [${a.andarNome}]`;
        destinoDatalist.appendChild(opt2);
      });
    }
    atualizarDatalistsGlobal();
    function atualizarDatalistBuscaLateral() {
      const allAreas = getAllAreasWithAndar();
      const buscaList = document.getElementById("areaBuscaList");
      buscaList.innerHTML = "";
      allAreas.forEach((a) => {
        const opt = document.createElement("option");
        opt.value = `${a.nome} [${a.andarNome}]`;
        buscaList.appendChild(opt);
      });
    }
    atualizarDatalistBuscaLateral();

    function focarAreaPorQuery() {
      const lojaParam = params.get("loja");
      if (!lojaParam) return;
      const andarParam = params.get("andar");
      const allAreas = getAllAreasWithAndar();
      const area = andarParam
        ? allAreas.find(
            (a) => a.nome === lojaParam && a.andarNome === andarParam,
          )
        : allAreas.find((a) => a.nome === lojaParam);
      if (!area) return;
      if (currentAndarIdx !== area.andar) {
        andarSelect.value = area.andar;
        desenharAndar(area.andar);
      }
      setTimeout(() => {
        const idx = andares[area.andar].areas.findIndex(
          (a2) => a2.nome === area.nome,
        );
        if (idx >= 0 && areaObjs[idx]) {
          areaObjs[idx].fire("click");
        }
      }, 300);
    }
    focarAreaPorQuery();
    document
      .getElementById("areaBuscaSelect")
      .addEventListener("change", function () {
        const val = this.value;
        const area = getAllAreasWithAndar().find(
          (a) => `${a.nome} [${a.andarNome}]` === val,
        );
        if (!area) return;
        if (currentAndarIdx !== area.andar) {
          andarSelect.value = area.andar;
          desenharAndar(area.andar);
        }
        setTimeout(() => {
          const idx = andares[area.andar].areas.findIndex(
            (a2) => a2.nome === area.nome,
          );
          if (idx >= 0 && areaObjs[idx]) {
            areaObjs[idx].fire("click");
          }
        }, 300);
      });
    function findAreaByInput(inputValue) {
      const allAreas = getAllAreasWithAndar();
      return allAreas.find((a) => `${a.nome} [${a.andarNome}]` === inputValue);
    }
    // Escolhe a área mais próxima pelo caminho real; se nenhuma for alcançável
    // pelo grafo, cai de volta na distância em linha reta.
    function areaMaisProximaPorCaminho(candidatas, fromLabel, andarIdx) {
      if (!candidatas.length) return null;
      let min = Infinity,
        nearest = null;
      candidatas.forEach((a) => {
        const d = custoCaminhada(fromLabel, a.label, andarIdx);
        if (d < min) {
          min = d;
          nearest = a;
        }
      });
      if (nearest) return nearest;
      min = Infinity;
      candidatas.forEach((a) => {
        const d = dist(fromLabel, a.label);
        if (d < min) {
          min = d;
          nearest = a;
        }
      });
      return nearest;
    }
    function findNearestTransferArea(andarIdx, fromLabel) {
      const transferAreas = andares[andarIdx].areas.filter(
        (a) =>
          a.categoria &&
          (a.categoria.toLowerCase() === "escada" ||
            a.categoria.toLowerCase() === "elevador"),
      );
      return areaMaisProximaPorCaminho(transferAreas, fromLabel, andarIdx);
    }
    function findNearestElevadorArea(andarIdx, fromLabel) {
      const elevadores = andares[andarIdx].areas.filter(
        (a) => a.categoria && a.categoria.toLowerCase() === "elevador",
      );
      return areaMaisProximaPorCaminho(elevadores, fromLabel, andarIdx);
    }
    function carregarAndares() {
      andarSelect.innerHTML = "";
      andares.forEach((andar, idx) => {
        const opt = document.createElement("option");
        opt.value = idx;
        opt.textContent = andar.nome;
        andarSelect.appendChild(opt);
      });
    }
    function carregarCategorias() {
      const categorias = new Set();
      andares.forEach((andar) => {
        andar.areas.forEach((area) => {
          if (area.categoria) categorias.add(area.categoria);
        });
      });
      categoriaSelect.innerHTML =
        '<option value="">Filtrar por categoria</option>';
      categorias.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        categoriaSelect.appendChild(opt);
      });
    }
    carregarAndares();
    carregarCategorias();
    categoriaSelect.onchange = function () {
      categoriaMarkers.forEach((m) => map.removeLayer(m));
      categoriaMarkers = [];
      const cat = categoriaSelect.value;
      const areasNoAndar = andares[currentAndarIdx].areas.filter(
        (area) => area.categoria === cat,
      );
      let andarComCategoria = currentAndarIdx;
      if (cat && areasNoAndar.length === 0) {
        for (let i = 0; i < andares.length; i++) {
          if (andares[i].areas.some((area) => area.categoria === cat)) {
            andarComCategoria = i;
            break;
          }
        }
        if (andarComCategoria !== currentAndarIdx) {
          andarSelect.value = andarComCategoria;
          desenharAndar(andarComCategoria);
        }
      }
      let bounds = [];
      areaObjs.forEach((areaObj, idx) => {
        const areaData = andares[andarComCategoria].areas[idx];
        const label = areaData.label;
        const labelValido =
          Array.isArray(label) &&
          label.length === 2 &&
          typeof label[0] === "number" &&
          typeof label[1] === "number" &&
          !isNaN(label[0]) &&
          !isNaN(label[1]);
        if (cat && areaData.categoria === cat && labelValido) {
          // azul tracejado: resultado de filtro, para não confundir com a
          // seleção de uma área (que usa contorno vermelho sólido)
          areaObj.setStyle({ color: "#0d6efd", weight: 3, dashArray: "6 4" });
          bounds.push(label);
        } else {
          areaObj.setStyle({
            color: "transparent",
            weight: 3,
            dashArray: null,
          });
        }
      });
      if (bounds.length === 1) {
        // uma única área: mantém o zoom atual, só centraliza
        map.setView(bounds[0], Math.min(map.getZoom(), ZOOM_MAX_FOCO), {
          animate: true,
        });
      } else if (bounds.length > 1) {
        // sem maxZoom, poucas áreas próximas jogam o mapa no zoom máximo
        map.fitBounds(bounds, { padding: [40, 40], maxZoom: ZOOM_MAX_FOCO });
      }
      if (!cat) return;
      andares[andarComCategoria].areas.forEach((area, idx) => {
        const label = area.label;
        const labelValido =
          Array.isArray(label) &&
          label.length === 2 &&
          typeof label[0] === "number" &&
          typeof label[1] === "number" &&
          !isNaN(label[0]) &&
          !isNaN(label[1]);
        if (area.categoria === cat && labelValido) {
          const marker = L.marker(label, {
            title:
              area.nome + (area.subcategoria ? " - " + area.subcategoria : ""),
          }).addTo(map);
          categoriaMarkers.push(marker);
        }
      });
    };

    const observer = new MutationObserver(() => {
      if (sidebar.classList.contains("open")) {
        limparMarcadoresCategoria();
        limparEstilosDasAreas();
      }
    });

    // Observar alterações na classe do sidebar
    observer.observe(sidebar, { attributes: true, attributeFilter: ["class"] });
  }
})();
