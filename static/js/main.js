document.addEventListener('DOMContentLoaded', () => {
    const uploadButton = document.getElementById('uploadButton');
    const csvFileInput = document.getElementById('csvFileInput');
    const loadingMessage = document.getElementById('loadingMessage');
    const resultInfoPanel = document.getElementById('resultInfoPanel');
    const chartPanel = document.getElementById('chartPanel');
    const infoDate = document.getElementById('infoDate');
    const infoTime = document.getElementById('infoTime');
    const infoTotalResult = document.getElementById('infoTotalResult');
    const infoPartSerial = document.getElementById('infoPartSerial');
    const infoProgramName = document.getElementById('infoProgramName');
    const eoLegendDiv = document.getElementById('eoLegend');

    uploadButton.addEventListener('click', () => {
        csvFileInput.click(); 
    });

    csvFileInput.addEventListener('change', async (event) => {
        const file = event.target.files[0];
        if (!file) {
            return;
        }

        loadingMessage.style.display = 'inline';
        resultInfoPanel.style.display = 'none';
        chartPanel.style.display = 'none';

        const formData = new FormData();
        formData.append('file', file);

        try {
            const response = await fetch('/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.error || 'Erro ao fazer upload do arquivo.');
            }

            const data = await response.json();
            console.log("Dados recebidos do backend (main.js):", data); 
            
            displayResultInfo(data.result_info);
            plotMeasuringCurve(data.measuring_curve, data.evaluation_objects);

            resultInfoPanel.style.display = 'block';
            chartPanel.style.display = 'flex'; 
            loadingMessage.style.display = 'none';
        } catch (error) {
            console.error('Erro no frontend:', error);
            alert(`Erro ao processar o arquivo: ${error.message}`);
            loadingMessage.style.display = 'none';
            resultInfoPanel.style.display = 'none';
            chartPanel.style.display = 'none';
        }
    });

    function displayResultInfo(info) {
        infoDate.textContent = info.Date;
        infoTime.textContent = info.Time;
        infoPartSerial.textContent = info['Part serial number'];
        infoProgramName.textContent = info['Measuring program name'];

        infoTotalResult.textContent = info['Total result'];
        infoTotalResult.classList.remove('total-result-ok', 'total-result-nok');
        if (info['Total result'] === 'OK') {
            infoTotalResult.classList.add('total-result-ok');
        } else if (info['Total result'] === 'NOK') {
            infoTotalResult.classList.add('total-result-nok');
        }
    }

    function plotMeasuringCurve(curveData, evaluationObjects) {
        console.log("------------------------------------------");
        console.log("plotMeasuringCurve chamada (main.js).");
        console.log("Dados da curva:", curveData);
        console.log("Objetos de avaliação (evaluationObjects):", evaluationObjects);

        const traceCurve = {
            x: curveData.X,
            y: curveData.Y,
            mode: 'lines',
            name: 'Curva de Medição',
            line: { color: '#007bff', width: 2 }
        };

        const traces = [traceCurve];
        const shapes = [];
        const annotations = [];
        let eoLegendHtml = '';

        const eoColors = {
            'LINE-X': 'orange',
            'NO-PASS': 'red',
            'MIN-MAX': 'purple', 
            'LIMIT-RANGE': 'green', 
            'LINE-Y': 'brown' 
        };

        evaluationObjects.forEach((eo, index) => { 
            console.log(`Processando EO-${index + 1}:`, eo); 
            const reaction = eo.Reaction;
            // Usa 'EO_Identifier' que adicionamos no Python, ou 'Evaluation objects settings' do CSV
            // Se nenhum dos dois, usa um nome genérico
            const eoName = eo.EO_Identifier || (eo['Evaluation objects settings'] && eo['Evaluation objects settings'].startsWith('EO-') ? eo['Evaluation objects settings'].match(/EO-\d+/)[0] : `EO-${index + 1}`); 
            
            const xMin = parseFloat(eo.XMin);
            const xMax = parseFloat(eo.XMax);
            const yMin = parseFloat(eo.YMin); 
            const yMax = parseFloat(eo.YMax); 
            const xRef = parseFloat(eo.X); // Para LINE-Y, se houver


            let yRefValue; // Variável para armazenar o valor de Y de referência
            if (reaction === 'LINE-X' || reaction === 'NO-PASS') {
                yRefValue = yMin; // Para LINE-X e NO-PASS, pegamos o YMin como referência
            } else {
                yRefValue = parseFloat(eo.Y); // Para outros tipos, se houver 'Y' específico na coluna 'Y'
            }

            const color = eoColors[reaction] || 'gray'; 

            console.log(`EO ${eoName} - Reaction: ${reaction}, XMin: ${xMin}, XMax: ${xMax}, YMin: ${yMin}, YMax: ${yMax}, XRef: ${xRef}, Calculated YRefValue: ${yRefValue}`);

            // Lógica para desenhar as linhas de avaliação
            // Condição para LINE-X e NO-PASS (linhas horizontais)
            if (reaction === 'LINE-X' || reaction === 'NO-PASS') {
                if (!isNaN(yRefValue) && !isNaN(xMin) && !isNaN(xMax)) { 
                    console.log(`Criando shape para ${eoName}: Y=${yRefValue} entre X=${xMin} e ${xMax}`); 
                    shapes.push({
                        type: 'line',
                        xref: 'x',
                        yref: 'y', 
                        x0: xMin,
                        y0: yRefValue, 
                        x1: xMax,
                        y1: yRefValue,
                        line: {
                            color: color,
                            width: 2,
                            dash: 'dash'
                        },
                        name: `${eoName} (${reaction})`
                    });
                    
                    annotations.push({
                        xref: 'x',
                        yref: 'y',
                        x: xMin + (xMax - xMin) / 2,
                        y: yRefValue, 
                        text: `${eoName}`,
                        showarrow: false,
                        xanchor: 'center',
                        yanchor: 'bottom',
                        font: {
                            color: color,
                            size: 10
                        },
                        yshift: 5
                    });

                    eoLegendHtml += `
                        <div class="eo-legend-item">
                            <div class="eo-color-box" style="background-color: ${color};"></div>
                            <span>${eoName}: ${reaction} (X: ${xMin} to ${xMax} mm, Y: ${yRefValue} N)</span>
                        </div>
                    `;
                } else {
                    console.warn(`Dados inválidos para ${eoName} (LINE-X/NO-PASS): yRefValue=${yRefValue}, xMin=${xMin}, xMax=${xMax}`);
                }
            } 
            // Lógica para LINE-Y (linha vertical)
            else if (reaction === 'LINE-Y') {
                if (!isNaN(xRef) && !isNaN(yMin) && !isNaN(yMax)) {
                    console.log(`Criando shape para ${eoName}: X=${xRef} entre Y=${yMin} e ${yMax}`);
                    shapes.push({
                        type: 'line',
                        xref: 'x',
                        yref: 'y',
                        x0: xRef,
                        y0: yMin,
                        x1: xRef,
                        y1: yMax,
                        line: {
                            color: color,
                            width: 2,
                            dash: 'dot' 
                        },
                        name: `${eoName} (${reaction})`
                    });
                    annotations.push({
                        xref: 'x',
                        yref: 'y',
                        x: xRef,
                        y: yMin + (yMax - yMin) / 2,
                        text: `${eoName}`,
                        showarrow: false,
                        xanchor: 'left',
                        yanchor: 'middle',
                        font: {
                            color: color,
                            size: 10
                        },
                        xshift: 5
                    });
                    eoLegendHtml += `
                        <div class="eo-legend-item">
                            <div class="eo-color-box" style="background-color: ${color};"></div>
                            <span>${eoName}: ${reaction} (X: ${xRef} mm, Y: ${yMin} to ${yMax} N)</span>
                        </div>
                    `;
                } else {
                    console.warn(`Dados inválidos para ${eoName} (LINE-Y): xRef=${xRef}, yMin=${yMin}, yMax=${yMax}`);
                }
            }
            // Lógica para MIN-MAX ou LIMIT-RANGE (caixa retangular)
            else if (reaction === 'MIN-MAX' || reaction === 'LIMIT-RANGE') {
                if (!isNaN(xMin) && !isNaN(xMax) && !isNaN(yMin) && !isNaN(yMax)) {
                    console.log(`Criando shape para ${eoName}: Retângulo X=${xMin}-${xMax}, Y=${yMin}-${yMax}`);
                    shapes.push({
                        type: 'rect', 
                        xref: 'x',
                        yref: 'y',
                        x0: xMin,
                        y0: yMin,
                        x1: xMax,
                        y1: yMax,
                        line: {
                            color: color,
                            width: 1,
                        },
                        fillcolor: `rgba(${parseInt(color.slice(1, 3), 16)}, ${parseInt(color.slice(3, 5), 16)}, ${parseInt(color.slice(5, 7), 16)}, 0.1)`, 
                        name: `${eoName} (${reaction})`
                    });
                    annotations.push({
                        xref: 'x',
                        yref: 'y',
                        x: xMin,
                        y: yMax,
                        text: `${eoName}`,
                        showarrow: false,
                        xanchor: 'left',
                        yanchor: 'bottom',
                        font: {
                            color: color,
                            size: 10
                        },
                        yshift: 5
                    });
                    eoLegendHtml += `
                        <div class="eo-legend-item">
                            <div class="eo-color-box" style="background-color: ${color}; border: 1px solid ${color};"></div>
                            <span>${eoName}: ${reaction} (X: ${xMin} to ${xMax} mm, Y: ${yMin} to ${yMax} N)</span>
                        </div>
                    `;
                } else {
                    console.warn(`Dados inválidos para ${eoName} (MIN-MAX/LIMIT-RANGE): xMin=${xMin}, xMax=${xMax}, yMin=${yMin}, yMax=${yMax}`);
                }
            } else {
                console.log(`EO ${eoName} com reação '${reaction}' não processado (ou é OFF).`);
            }
        });

        console.log("Shapes criados (main.js):", shapes);
        console.log("Annotations criadas (main.js):", annotations);

        const layout = {
            xaxis: {
                title: 'Deslocamento (mm)',
                rangemode: 'tozero',
                autorange: true 
            },
            yaxis: {
                title: 'Força (N)',
                rangemode: 'tozero',
                autorange: true 
            },
            hovermode: 'closest',
            margin: { t: 40, b: 40, l: 60, r: 40 }, 
            shapes: shapes,
            annotations: annotations,
            showlegend: true, 
            legend: { x: 0, y: 1.1, xanchor: 'left', yanchor: 'top', orientation: 'h' },
            responsive: true 
        };

        Plotly.newPlot('pressingCurveChart', traces, layout, {
            responsive: true,
            displayModeBar: true, 
            modeBarButtonsToRemove: ['zoom2d', 'pan2d', 'select2d', 'lasso2d', 'autoScale2d', 'resetScale2d', 'hoverClosestCartesian', 'hoverCompareCartesian', 'toggleSpikelines'],
            modeBarButtonsToAdd: [
                {
                    name: 'Zoom In',
                    icon: Plotly.Icons.zoom_in,
                    click: function(gd) {
                        const newLayout = Plotly.d3.select(gd).node().layout;
                        Plotly.relayout(gd, {
                            'xaxis.range[0]': newLayout.xaxis.range[0] * 0.9,
                            'xaxis.range[1]': newLayout.xaxis.range[1] * 0.9,
                            'yaxis.range[0]': newLayout.yaxis.range[0] * 0.9,
                            'yaxis.range[1]': newLayout.yaxis.range[1] * 0.9
                        });
                    }
                },
                {
                    name: 'Zoom Out',
                    icon: Plotly.Icons.zoom_out,
                    click: function(gd) {
                        const newLayout = Plotly.d3.select(gd).node().layout;
                        Plotly.relayout(gd, {
                            'xaxis.range[0]': newLayout.xaxis.range[0] * 1.1,
                            'xaxis.range[1]': newLayout.xaxis.range[1] * 1.1,
                            'yaxis.range[0]': newLayout.yaxis.range[0] * 1.1,
                            'yaxis.range[1]': newLayout.yaxis.range[1] * 1.1
                        });
                    }
                },
                {
                    name: 'Pan',
                    icon: Plotly.Icons.pan,
                    click: function(gd) {
                        Plotly.relayout(gd, {'dragmode': 'pan'});
                    }
                },
                {
                    name: 'Reset Zoom',
                    icon: Plotly.Icons.autoscale,
                    click: function(gd) {
                        Plotly.relayout(gd,{'xaxis.autorange': true, 'yaxis.autorange': true });
                    }
                }
            ]
        });
        eoLegendDiv.innerHTML = eoLegendHtml;
        console.log("HTML da legenda EO atualizado (main.js).");
        console.log("------------------------------------------");
    }
});