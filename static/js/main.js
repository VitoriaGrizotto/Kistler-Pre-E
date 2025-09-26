document.addEventListener('DOMContentLoaded', () => {
    const uploadButton = document.getElementById('uploadButton');
    const csvFileInput = document.getElementById('csvFileInput');
    const loadingMessage = document.getElementById('loadingMessage');
    const resultInfoPanel = document.getElementById('resultInfoPanel');
    const processValuesCurveRelatedPanel = document.getElementById('processValuesCurveRelatedPanel');
    const processValuesCurveRelatedContent = document.getElementById('processValuesCurveRelatedContent');
    const evaluationObjectSettingsPanel = document.getElementById('evaluationObjectSettingsPanel');
    const evaluationObjectSettingsContent = document.getElementById('evaluationObjectSettingsContent');

    const chartPanel = document.getElementById('chartPanel');
    const infoDate = document.getElementById('infoDate');
    const infoTime = document.getElementById('infoTime');
    const infoTotalResult = document.getElementById('infoTotalResult');
    const infoPartSerial = document.getElementById('infoPartSerial');
    const infoProgramName = document.getElementById('infoProgramName');
    const infoEntry = document.getElementById('infoEntry'); // NOVO ELEMENTO
    const eoLegendDiv = document.getElementById('eoLegend');

    let currentPlotData = {
        traces: [],
        shapes: [],
        annotations: [],
        eoPlotIndices: {}
    };

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
        processValuesCurveRelatedPanel.style.display = 'none';
        evaluationObjectSettingsPanel.style.display = 'none';
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
            displayProcessValuesCurveRelated(data.process_values_curve_related);
            displayEvaluationObjectSettings(data.evaluation_objects); 
            plotMeasuringCurve(data.measuring_curve, data.evaluation_objects);

            resultInfoPanel.style.display = 'block';
            processValuesCurveRelatedPanel.style.display = 'block';
            evaluationObjectSettingsPanel.style.display = 'block';
            chartPanel.style.display = 'flex'; 
            loadingMessage.style.display = 'none';
        } catch (error) {
            console.error('Erro no frontend:', error);
            alert(`Erro ao processar o arquivo: ${error.message}`);
            loadingMessage.style.display = 'none';
            resultInfoPanel.style.display = 'none';
            processValuesCurveRelatedPanel.style.display = 'none';
            evaluationObjectSettingsPanel.style.display = 'none';
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

        // NOVO: Exibir o valor 'Entry'
        infoEntry.textContent = info.Entry !== "N/A" ? `${info.Entry} mm` : '-';
    }

    function displayProcessValuesCurveRelated(processValues) {
        let htmlContent = '';
        if (Object.keys(processValues).length === 0) {
            htmlContent = '<p>Nenhuma informação de "Process values - curve related" encontrada.</p>';
        } else {
            htmlContent += '<div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 1rem;">';
            for (const key in processValues) {
                if (processValues.hasOwnProperty(key)) {
                    const item = processValues[key];
                    let displayValue = 'N/A';
                    if (item.value !== null) {
                        displayValue = item.value.toFixed(3);
                        if (item.unit) {
                            displayValue += ` ${item.unit}`;
                        }
                    } else if (item.unit) {
                         displayValue = item.unit;
                    }
                    htmlContent += `
                        <div>
                            <strong>${key}:</strong> <span>${displayValue}</span>
                        </div>
                    `;
                }
            }
            htmlContent += '</div>';
        }
        processValuesCurveRelatedContent.innerHTML = htmlContent;
    }

    function displayEvaluationObjectSettings(evaluationObjects) {
        let htmlContent = '';
        if (!evaluationObjects || evaluationObjects.length === 0) {
            htmlContent = '<p>Nenhum Objeto de Avaliação (EO) ativo encontrado.</p>';
        } else {
            htmlContent += `
                <table class="eo-settings-table">
                    <thead>
                        <tr>
                            <th>EO</th>
                            <th>Reação</th>
                            <th>XMin</th>
                            <th>XMax</th>
                            <th>YMin</th>
                            <th>YMax</th>
                            <th>X Ref</th>
                            <th>Y Ref</th>
                            <th>Resultado</th>
                        </tr>
                    </thead>
                    <tbody>
            `;

            evaluationObjects.forEach(eo => {
                const eoIdentifier = eo.EO_Identifier || 'N/A';
                const reaction = eo.Reaction || 'N/A';
                const xMin = eo.XMin_num !== null ? eo.XMin_num.toFixed(3) : 'N/A';
                const xMax = eo.XMax_num !== null ? eo.XMax_num.toFixed(3) : 'N/A';
                const yMin = eo.YMin_num !== null ? eo.YMin_num.toFixed(3) : 'N/A';
                const yMax = eo.YMax_num !== null ? eo.YMax_num.toFixed(3) : 'N/A';
                const xRef = eo.X_num !== null ? eo.X_num.toFixed(3) : 'N/A';
                const yRef = eo.Y_num !== null ? eo.Y_num.toFixed(3) : 'N/A';
                const result = eo.evaluation_result || 'UNKNOWN';
                const resultClass = result === 'OK' ? 'total-result-ok' : (result === 'NOK' || result === 'NOK_OUT_OF_RANGE' ? 'total-result-nok' : '');


                htmlContent += `
                    <tr>
                        <td><strong>${eoIdentifier}</strong></td>
                        <td>${reaction}</td>
                        <td>${xMin}</td>
                        <td>${xMax}</td>
                        <td>${yMin}</td>
                        <td>${yMax}</td>
                        <td>${xRef}</td>
                        <td>${yRef}</td>
                        <td class="${resultClass}">${result}</td>
                    </tr>
                `;
            });

            htmlContent += `
                    </tbody>
                </table>
            `;
        }
        evaluationObjectSettingsContent.innerHTML = htmlContent;
    }


    function plotMeasuringCurve(curveData, evaluationObjects) {
        console.log("plotMeasuringCurve chamada");
        console.log("curveData:", curveData);
        console.log("evaluationObjects:", evaluationObjects);

        const traceCurve = {
            x: curveData.X,
            y: curveData.Y,
            mode: 'lines',
            name: 'Curva de Medição',
            line: { color: '#007bff', width: 2 },
            showlegend: true 
        };

        const traces = [traceCurve];
        const shapes = [];
        annotations = []; // Certifique-se de que annotations seja redefinido
        let eoLegendHtml = '';

        currentPlotData.eoPlotIndices = {};

        const eoColors = {
            'LINE-X': '#ff8c00',       
            'NO-PASS': '#d9534f',      
            'MIN-MAX': '#6f42c1',      
            'LIMIT-RANGE': '#28a745',  
            'LINE-Y': '#8b4513'        
        };

        evaluationObjects.forEach((eo, index) => {
            console.log(`Processando EO ${index + 1}:`, eo);
            const reaction = eo.Reaction;
            const eoName = eo.EO_Identifier || `EO-${index+1}`;
            const eoId = `eo-${index}`; 
            const initialVisibility = true; 

            const xMin = eo.XMin_num;
            const xMax = eo.XMax_num;
            const yMin = eo.YMin_num;
            const yMax = eo.YMax_num;
            const xRef = eo.X_num; 
            const yRef = eo.Y_num;

            const color = eoColors[reaction] || '#667';

            currentPlotData.eoPlotIndices[eoId] = {
                shapeIndices: [],
                annotationIndices: [],
                traceIndices: []
            };

            if ((reaction === 'LINE-X' || reaction === 'NO-PASS') && xMin != null && xMax != null) {
                const yRefValue = (reaction === 'NO-PASS') ? (yMax != null ? yMax : yMin) : yMin;
                if (yRefValue != null) {
                    shapes.push({
                        type: 'line',
                        xref: 'x', yref: 'y',
                        x0: xMin, y0: yRefValue,
                        x1: xMax, y1: yRefValue,
                        line: { color: color, width: 2, dash: 'dash' },
                        visible: initialVisibility
                    });
                    currentPlotData.eoPlotIndices[eoId].shapeIndices.push(shapes.length - 1);

                    shapes.push({
                        type: 'line',
                        xref: 'x', yref: 'paper',
                        x0: xMin, y0: 0, x1: xMin, y1: 1,
                        line: { color: '#888', width: 1, dash: 'dot' },
                        visible: initialVisibility
                    });
                    currentPlotData.eoPlotIndices[eoId].shapeIndices.push(shapes.length - 1);

                    shapes.push({
                        type: 'line',
                        xref: 'x', yref: 'paper',
                        x0: xMax, y0: 0, x1: xMax, y1: 1,
                        line: { color: '#888', width: 1, dash: 'dot' },
                        visible: initialVisibility
                    });
                    currentPlotData.eoPlotIndices[eoId].shapeIndices.push(shapes.length - 1);

                    annotations.push({
                        x: xMin + (xMax - xMin) / 2, y: yRefValue,
                        text: `${eoName}`,
                        showarrow: false, xanchor: 'center', yanchor: 'bottom',
                        font: { color: color, size: 11 },
                        visible: initialVisibility
                    });
                    currentPlotData.eoPlotIndices[eoId].annotationIndices.push(annotations.length - 1);

                    if (eo.x_cross != null && eo.y_cross != null) {
                        const markerColor = (eo.evaluation_result === 'OK') ? 'green' : (eo.evaluation_result === 'NOK' ? 'red' : 'orange');
                        traces.push({
                            x: [eo.x_cross],
                            y: [eo.y_cross],
                            mode: 'markers+text',
                            name: `${eoName} result`,
                            marker: { color: markerColor, size: 10 },
                            text: [eo.evaluation_result],
                            textposition: 'top center',
                            hoverinfo: 'x+y+text',
                            showlegend: false, 
                            visible: initialVisibility
                        });
                        currentPlotData.eoPlotIndices[eoId].traceIndices.push(traces.length - 1);
                    }
                }
            }
            else if (reaction === 'LINE-Y' && xRef != null && yMin != null && yMax != null) {

                shapes.push({
                    type: 'line',
                    xref: 'x', yref: 'y',
                    x0: xRef, y0: yMin,
                    x1: xRef, y1: yMax,
                    line: { color: color, width: 2, dash: 'dot' },
                    visible: initialVisibility
                });
                currentPlotData.eoPlotIndices[eoId].shapeIndices.push(shapes.length - 1);

                annotations.push({
                    x: xRef, y: yMax,
                    text: `${eoName}`,
                    showarrow: false, xanchor: 'left', yanchor: 'bottom',
                    font: { color: color, size: 11 },
                    visible: initialVisibility
                });
                currentPlotData.eoPlotIndices[eoId].annotationIndices.push(annotations.length - 1);

                if (eo.x_cross != null && eo.y_cross != null) {
                    const markerColor = (eo.evaluation_result === 'OK') ? 'green' : 'red';
                    traces.push({
                        x: [eo.x_cross],
                        y: [eo.y_cross],
                        mode: 'markers+text',
                        name: `${eoName} result`,
                        marker: { color: markerColor, size: 10 },
                        text: [eo.evaluation_result],
                        textposition: 'top center',
                        hoverinfo: 'x+y+text',
                        showlegend: false,
                        visible: initialVisibility
                    });
                    currentPlotData.eoPlotIndices[eoId].traceIndices.push(traces.length - 1);
                }
            }
            else if ((reaction === 'MIN-MAX' || reaction === 'LIMIT-RANGE') && xMin != null && xMax != null && yMin != null && yMax != null) {
                shapes.push({
                    type: 'rect',
                    xref: 'x', yref: 'y',
                    x0: xMin, y0: yMin,
                    x1: xMax, y1: yMax,
                    line: { color: color, width: 1 },
                    fillcolor: 'rgba(0,0,0,0)', 
                    visible: initialVisibility
                });
                currentPlotData.eoPlotIndices[eoId].shapeIndices.push(shapes.length - 1);

                annotations.push({
                    x: xMax, y: yMax,
                    text: `${eoName}`,
                    showarrow: false, xanchor: 'right', yanchor: 'bottom',
                    font: { color: color, size: 11 },
                    visible: initialVisibility
                });
                currentPlotData.eoPlotIndices[eoId].annotationIndices.push(annotations.length - 1);

                 if (eo.x_cross != null && eo.y_cross != null) {
                    const markerColor = (eo.evaluation_result === 'OK') ? 'green' : 'red';
                    traces.push({
                        x: [eo.x_cross],
                        y: [eo.y_cross],
                        mode: 'markers+text',
                        name: `${eoName} result`,
                        marker: { color: markerColor, size: 10 },
                        text: [eo.evaluation_result],
                        textposition: 'top center',
                        hoverinfo: 'x+y+text',
                        showlegend: false,
                        visible: initialVisibility
                    });
                    currentPlotData.eoPlotIndices[eoId].traceIndices.push(traces.length - 1);
                }
            } else {
                annotations.push({ 
                    x: 0, y: 0, text: '', showarrow: false, visible: false
                });
                currentPlotData.eoPlotIndices[eoId].annotationIndices.push(annotations.length - 1);
            }

            const status = eo.evaluation_result || 'UNKNOWN';
            const statusColor = (status === 'OK') ? 'green' : (status === 'NOK' ? 'red' : (status === 'NOK_OUT_OF_RANGE' ? 'orange' : '#666'));
            const reason = eo.evaluation_reason || '';

            eoLegendHtml += `
                <div class="eo-legend-item">
                    <input type="checkbox" id="${eoId}-checkbox" data-eo-id="${eoId}" ${initialVisibility ? 'checked' : ''}> 
                    <div class="eo-color-box" style="background:${color};"></div>
                    <div style="flex:1;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <div><label for="${eoId}-checkbox"><strong>${eoName}</strong> (${reaction})</label></div>
                            <div style="color:${statusColor}; font-weight:600;">${status}</div>
                        </div>
                        <div style="font-size:0.85rem;color:#555;">
                            ${xMin != null && xMax != null ? `X: ${xMin} → ${xMax} mm` : ''}
                            ${(xMin != null || xMax != null) && (yMin != null || yMax != null) ? ', ' : ''}
                            ${yMin != null && yMax != null ? `Y: ${yMin} → ${yMax} N` : ''}
                            ${xRef != null ? `X: ${xRef} mm` : ''}
                            ${yRef != null ? `Y: ${yRef} N` : ''}
                        </div>
                        <div style="font-size:0.8rem;color:#666;">${reason}</div>
                    </div>
                </div>
            `;
        });

        const layout = {
            xaxis: { title: 'Deslocamento (mm)', rangemode: 'tozero', autorange: true },
            yaxis: { title: 'Força (N)', rangemode: 'tozero', autorange: true },
            hovermode: 'closest',
            margin: { t: 40, b: 40, l: 60, r: 40 },
            shapes: shapes,
            annotations: annotations,
            showlegend: true, 
            legend: { x: 0, y: 1.1, xanchor: 'left', yanchor: 'top', orientation: 'h' },
            responsive: true
        };

        currentPlotData.traces = traces;
        currentPlotData.shapes = shapes;
        currentPlotData.annotations = annotations;

        Plotly.newPlot('pressingCurveChart', traces, layout, {
            responsive: true,
            displayModeBar: true
        });

        eoLegendDiv.innerHTML = eoLegendHtml;

        document.querySelectorAll('.eo-legend-item input[type="checkbox"]').forEach(checkbox => {
            checkbox.addEventListener('change', (event) => {
                const eoId = event.target.dataset.eoId;
                const isVisible = event.target.checked;
                toggleEoVisibility(eoId, isVisible);
            });
        });
    }

    function toggleEoVisibility(eoId, isVisible) {
        const plotDiv = document.getElementById('pressingCurveChart');
        const eoIndices = currentPlotData.eoPlotIndices[eoId];

        if (!eoIndices) {
            console.warn(`EO ID ${eoId} não encontrado no mapeamento de índices.`);
            return;
        }

        if (eoIndices.traceIndices.length > 0) {
            const updateTrace = {
                visible: isVisible 
            };
            Plotly.restyle(plotDiv, updateTrace, eoIndices.traceIndices);
        }
        
        if (eoIndices.shapeIndices.length > 0) {
            const shapesUpdate = {};
            eoIndices.shapeIndices.forEach(idx => {
                shapesUpdate[`shapes[${idx}].visible`] = isVisible;
            });
            Plotly.relayout(plotDiv, shapesUpdate);
        }

        if (eoIndices.annotationIndices.length > 0) {
            const annotationsUpdate = {};
            eoIndices.annotationIndices.forEach(idx => {
                annotationsUpdate[`annotations[${idx}].visible`] = isVisible;
            });
            Plotly.relayout(plotDiv, annotationsUpdate);
        }
    }
});