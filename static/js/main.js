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
            console.log("Dados recebidos:", data); 
displayResultInfo(data.result_info);
            plotMeasuringCurve(data.measuring_curve, data.evaluation_objects);
resultInfoPanel.style.display = 'block';
            chartPanel.style.display = 'flex'; 
            loadingMessage.style.display = 'none';
} catch (error) {
            console.error('Erro:', error);
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
        let eoLegendHtml = '<h3>Limites de Avaliação (EOs):</h3>';
const eoColors = {
            'LINE-X': 'orange',
            'NO-PASS': 'red',
            'MIN-MAX': 'purple', 
            'LIMIT-RANGE': 'green', 
            'LINE-Y': 'brown' 
        };
evaluationObjects.forEach(eo => {
            const reaction = eo.Reaction;
            const eoName = eo['EO-01'].match(/EO-\d+/)[0]; 
            const xMin = parseFloat(eo.XMin);
            const xMax = parseFloat(eo.XMax);
            const yMin = parseFloat(eo.YMin);
            const yMax = parseFloat(eo.YMax);
            const yRef = parseFloat(eo.Y); 
            const color = eoColors[reaction] || 'gray'; 
if (reaction === 'LINE-X' || reaction === 'NO-PASS') {
                if (!isNaN(yRef) && !isNaN(xMin) && !isNaN(xMax)) {
                    shapes.push({
                        type: 'line',
                        xref: 'x',
                        yref: 'y',
                        x0: xMin,
                        y0: yRef,
                        x1: xMax,
                        y1: yRef,
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
                        y: yRef,
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
                            <span>${eoName}: ${reaction} (X: ${xMin} to ${xMax} mm, Y: ${yRef} N)</span>
                        </div>
                    `;
                }
            }
       
        });
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
                        Plotly.relayout(gd, { 'xaxis.autorange': true, 'yaxis.autorange': true });
                    }
                }
            ]
        });
eoLegendDiv.innerHTML = eoLegendHtml;
    }
});
