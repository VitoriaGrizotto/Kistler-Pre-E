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
        console.log("plotMeasuringCurve chamada");
        console.log("curveData:", curveData);
        console.log("evaluationObjects:", evaluationObjects);

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

            const xMin = eo.XMin_num;
            const xMax = eo.XMax_num;
            const yMin = eo.YMin_num;
            const yMax = eo.YMax_num;
            const xRef = eo.X_num;
            const yRef = eo.Y_num;

            const color = eoColors[reaction] || '#666';

            // desenhar linha horizontal (LINE-X / NO-PASS) entre XMin e XMax
            if ((reaction === 'LINE-X' || reaction === 'NO-PASS') && xMin != null && xMax != null) {
                const yRefValue = (reaction === 'NO-PASS') ? (yMax != null ? yMax : yMin) : yMin;
                if (yRefValue != null) {
                    shapes.push({
                        type: 'line',
                        xref: 'x',
                        yref: 'y',
                        x0: xMin,
                        y0: yRefValue,
                        x1: xMax,
                        y1: yRefValue,
                        line: { color: color, width: 2, dash: 'dash' },
                        name: `${eoName} (${reaction})`
                    });

                    // linhas verticais em XMin e XMax
                    shapes.push({
                        type: 'line',
                        xref: 'x',
                        yref: 'paper',
                        x0: xMin,
                        y0: 0,
                        x1: xMin,
                        y1: 1,
                        line: { color: '#888', width: 1, dash: 'dot' },
                        name: `${eoName} XMin`
                    });
                    shapes.push({
                        type: 'line',
                        xref: 'x',
                        yref: 'paper',
                        x0: xMax,
                        y0: 0,
                        x1: xMax,
                        y1: 1,
                        line: { color: '#888', width: 1, dash: 'dot' },
                        name: `${eoName} XMax`
                    });

                    annotations.push({
                        x: xMin + (xMax - xMin) / 2,
                        y: yRefValue,
                        text: `${eoName}`,
                        showarrow: false,
                        xanchor: 'center',
                        yanchor: 'bottom',
                        font: { color: color, size: 11 },
                    });

                    // create legend html entry (status colored)
                    const status = eo.evaluation_result || 'UNKNOWN';
                    const statusColor = (status === 'OK') ? 'green' : (status === 'NOK' ? 'red' : (status === 'NOK_OUT_OF_RANGE' ? 'orange' : '#666'));
                    const reason = eo.evaluation_reason || '';

                    eoLegendHtml += `
                        <div class="eo-legend-item">
                            <div class="eo-color-box" style="background:${color};"></div>
                            <div style="flex:1;">
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <div><strong>${eoName}</strong> (${reaction})</div>
                                    <div style="color:${statusColor}; font-weight:600;">${status}</div>
                                </div>
                                <div style="font-size:0.85rem;color:#555;">X: ${xMin} → ${xMax} mm, Y: ${yRefValue} N</div>
                                <div style="font-size:0.8rem;color:#666;">${reason}</div>
                            </div>
                        </div>
                    `;

                    // marcador (se houver cruzamento detectado pelo backend)
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
                            hoverinfo: 'x+y+text'
                        });
                    }
                }
            }
            // LINE-Y (vertical)
            else if (reaction === 'LINE-Y' && xRef != null && yMin != null && yMax != null) {
                shapes.push({
                    type: 'line',
                    xref: 'x',
                    yref: 'y',
                    x0: xRef,
                    y0: yMin,
                    x1: xRef,
                    y1: yMax,
                    line: { color: color, width: 2, dash: 'dot' },
                    name: `${eoName} (${reaction})`
                });
                annotations.push({
                    x: xRef,
                    y: yMax,
                    text: `${eoName}`,
                    showarrow: false,
                    xanchor: 'left',
                    yanchor: 'bottom',
                    font: { color: color, size: 11 }
                });

                const status = eo.evaluation_result || 'UNKNOWN';
                const statusColor = (status === 'OK') ? 'green' : (status === 'NOK' ? 'red' : '#666');
                eoLegendHtml += `
                    <div class="eo-legend-item">
                        <div class="eo-color-box" style="background:${color};"></div>
                        <div style="flex:1;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <div><strong>${eoName}</strong> (${reaction})</div>
                                <div style="color:${statusColor}; font-weight:600;">${status}</div>
                            </div>
                            <div style="font-size:0.85rem;color:#555;">X: ${xRef} mm, Y: ${yMin} → ${yMax} N</div>
                            <div style="font-size:0.8rem;color:#666;">${eo.evaluation_reason || ''}</div>
                        </div>
                    </div>
                `;

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
                        hoverinfo: 'x+y+text'
                    });
                }
            }
            // Rectangular cases: MIN-MAX / LIMIT-RANGE
            else if ((reaction === 'MIN-MAX' || reaction === 'LIMIT-RANGE') && xMin != null && xMax != null && yMin != null && yMax != null) {
                shapes.push({
                    type: 'rect',
                    xref: 'x',
                    yref: 'y',
                    x0: xMin,
                    y0: yMin,
                    x1: xMax,
                    y1: yMax,
                    line: { color: color, width: 1 },
                    fillcolor: 'rgba(0,0,0,0)', // no fill by default
                    name: `${eoName} (${reaction})`
                });

                const status = eo.evaluation_result || 'UNKNOWN';
                const statusColor = (status === 'OK') ? 'green' : (status === 'NOK' ? 'red' : '#666');
                eoLegendHtml += `
                    <div class="eo-legend-item">
                        <div class="eo-color-box" style="background:${color};"></div>
                        <div style="flex:1;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <div><strong>${eoName}</strong> (${reaction})</div>
                                <div style="color:${statusColor}; font-weight:600;">${status}</div>
                            </div>
                            <div style="font-size:0.85rem;color:#555;">X: ${xMin} → ${xMax} mm, Y: ${yMin} → ${yMax} N</div>
                            <div style="font-size:0.8rem;color:#666;">${eo.evaluation_reason || ''}</div>
                        </div>
                    </div>
                `;

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
                        hoverinfo: 'x+y+text'
                    });
                }
            } else {
                // Reaction not handled or missing numeric values
                const status = eo.evaluation_result || 'UNKNOWN';
                const statusColor = (status === 'OK') ? 'green' : (status === 'NOK' ? 'red' : '#666');
                eoLegendHtml += `
                    <div class="eo-legend-item">
                        <div class="eo-color-box" style="background:${color};"></div>
                        <div style="flex:1;">
                            <div style="display:flex;justify-content:space-between;align-items:center;">
                                <div><strong>${eoName}</strong> (${reaction})</div>
                                <div style="color:${statusColor}; font-weight:600;">${status}</div>
                            </div>
                            <div style="font-size:0.8rem;color:#666;">${eo.evaluation_reason || 'Não processado'}</div>
                        </div>
                    </div>
                `;
            }
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

        Plotly.newPlot('pressingCurveChart', traces, layout, {
            responsive: true,
            displayModeBar: true
        });

        eoLegendDiv.innerHTML = eoLegendHtml;
    }
});
