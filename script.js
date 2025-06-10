// 全局变量
let bloodPressureChart = null;
let pulseChart = null;

// 颜色配置
const colorConfig = {
    // 高压相关颜色
    highPressure: {
        main: 'rgb(255, 159, 159)',      // 柔和的红色
        avg: 'rgb(255, 183, 77)',        // 柔和的橙色
        limit: 'rgb(255, 107, 107)',     // 柔和的警示红
        limitBg: 'rgba(255, 107, 107, 0.1)', // 柔和的警示红背景
        bg: 'rgba(255, 159, 159, 0.1)'   // 柔和的红色背景
    },
    // 低压相关颜色
    lowPressure: {
        main: 'rgb(77, 171, 247)',       // 柔和的蓝色
        avg: 'rgb(131, 194, 246)',        // 柔和的蓝色
        limit: 'rgb(255, 149, 0)',       // 柔和的橙色
        limitBg: 'rgba(255, 149, 0, 0.1)', // 柔和的橙色背景
        bg: 'rgba(77, 171, 247, 0.1)'    // 柔和的蓝色背景
    },
    // 脉搏相关颜色
    pulse: {
        main: 'rgb(129, 199, 132)',      // 柔和的绿色
        avg: 'rgb(179, 242, 182)',       // 柔和的绿色
        bg: 'rgba(129, 199, 132, 0.1)'   // 柔和的绿色背景
    },
    // 通用颜色
    common: {
        grid: 'rgba(0, 0, 0, 0.05)',     // 更淡的网格线
        text: 'rgb(97, 97, 97)',         // 柔和的深灰色
        error: 'rgb(244, 67, 54)'        // 柔和的错误红
    }
};

let pressureSettings = {
    highPressureMax: 140,
    highPressureMin: 90,
    lowPressureMax: 90,
    lowPressureMin: 60
};

// 预处理数据：5分钟间隔取平均值
function preprocessData(data) {
    // 按5分钟间隔分组
    const groups = new Map();
    
    data.forEach(entry => {
        // 将时间向下取整到最近的5分钟
        const time = new Date(entry.date);
        const minutes = time.getMinutes();
        const roundedMinutes = Math.floor(minutes / 5) * 5;
        const roundedTime = new Date(time);
        roundedTime.setMinutes(roundedMinutes, 0, 0);
        const timeKey = roundedTime.getTime();
        
        if (!groups.has(timeKey)) {
            groups.set(timeKey, {
                date: roundedTime,
                highPressure: [],
                lowPressure: [],
                pulse: []
            });
        }
        
        const group = groups.get(timeKey);
        group.highPressure.push(entry.highPressure);
        group.lowPressure.push(entry.lowPressure);
        group.pulse.push(entry.pulse);
    });
    
    // 计算每组的平均值
    const processedData = Array.from(groups.values()).map(group => ({
        date: group.date,
        highPressure: Math.round(group.highPressure.reduce((a, b) => a + b, 0) / group.highPressure.length),
        lowPressure: Math.round(group.lowPressure.reduce((a, b) => a + b, 0) / group.lowPressure.length),
        pulse: Math.round(group.pulse.reduce((a, b) => a + b, 0) / group.pulse.length)
    }));
    
    return {
        originalCount: data.length,
        processedData: processedData.sort((a, b) => a.date - b.date)
    };
}

// 初始化
async function init() {
    // 添加文件上传事件监听
    const fileInput = document.getElementById('csvFile');
    const fileInfo = document.getElementById('fileInfo');
    
    fileInput.addEventListener('change', async function(e) {
        const file = e.target.files[0];
        if (file) {
            if (file.type !== 'text/csv' && !file.name.endsWith('.csv')) {
                fileInfo.textContent = '请选择CSV文件';
                return;
            }
            
            fileInfo.textContent = `已选择: ${file.name}`;
            const rawData = await loadDataFromFile(file);
            if (rawData.length > 0) {
                const { originalCount, processedData } = preprocessData(rawData);
                updateStats(processedData, originalCount);
                updateTable(processedData);
                createChart(processedData);
            } else {
                fileInfo.textContent = '文件格式错误或为空';
            }
        }
    });
    
    // 添加设置按钮事件监听
    document.getElementById('applySettings').addEventListener('click', applySettings);
}

// 从文件加载数据
async function loadDataFromFile(file) {
    try {
        const text = await file.text();
        return parseCSV(text);
    } catch (error) {
        console.error('加载数据失败:', error);
        return [];
    }
}

// 解析CSV数据
function parseCSV(csv) {
    const lines = csv.split('\n');
    const headers = lines[0].split(',');
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = lines[i].split(',');
        const entry = {
            date: new Date(values[0]),
            highPressure: parseInt(values[1]),
            lowPressure: parseInt(values[2]),
            pulse: parseInt(values[3])
        };
        data.push(entry);
    }
    
    return data;
}

// 计算统计数据
function calculateStats(data, field) {
    const values = data.map(item => item[field]);
    const sum = values.reduce((a, b) => a + b, 0);
    const avg = sum / values.length;
    const max = Math.max(...values);
    const min = Math.min(...values);
    
    return {
        average: avg.toFixed(1),
        max: max,
        min: min
    };
}

// 计算异常值统计
function calculateAbnormalStats(data) {
    const total = data.length;
    const highAbnormal = data.filter(item => item.highPressure > pressureSettings.highPressureMax).length;
    const lowAbnormal = data.filter(item => item.lowPressure > pressureSettings.lowPressureMax).length;
    
    return {
        total,
        highAbnormal,
        lowAbnormal,
        highAbnormalPercentage: ((highAbnormal / total) * 100).toFixed(1),
        lowAbnormalPercentage: ((lowAbnormal / total) * 100).toFixed(1)
    };
}

// 更新统计信息显示
function updateStats(data, originalCount) {
    const highPressureStats = calculateStats(data, 'highPressure');
    const lowPressureStats = calculateStats(data, 'lowPressure');
    const pulseStats = calculateStats(data, 'pulse');
    const abnormalStats = calculateAbnormalStats(data);
    
    // 更新测量统计
    document.getElementById('measurementStats').innerHTML = `
        <p>
            <span class="label">原始数据点数</span>
            <span class="value">${originalCount} 次</span>
        </p>
        <p>
            <span class="label">处理后数据点数<span class="info-icon" title="间隔5分钟的多条数据取平均值">?</span></span>
            <span class="value">${data.length} 次</span>
        </p>
        <p>
            <span class="label">高压异常次数<span class="info-icon" title="超过${pressureSettings.highPressureMax}mmHg的次数">?</span></span>
            <span class="value">${abnormalStats.highAbnormal} 次</span>
            <span class="percentage">(${abnormalStats.highAbnormalPercentage}%)</span>
        </p>
        <p>
            <span class="label">低压异常次数<span class="info-icon" title="超过${pressureSettings.lowPressureMax}mmHg的次数">?</span></span>
            <span class="value">${abnormalStats.lowAbnormal} 次</span>
            <span class="percentage">(${abnormalStats.lowAbnormalPercentage}%)</span>
        </p>
    `;
    
    // 更新高压统计
    document.getElementById('highPressureStats').innerHTML = `
        <p>
            <span class="label">最高值</span>
            <span class="value">${highPressureStats.max} mmHg</span>
        </p>
        <p>
            <span class="label">最低值</span>
            <span class="value">${highPressureStats.min} mmHg</span>
        </p>
        <p>
            <span class="label">平均值</span>
            <span class="value">${highPressureStats.average} mmHg</span>
        </p>
    `;
    
    // 更新低压统计
    document.getElementById('lowPressureStats').innerHTML = `
        <p>
            <span class="label">最高值</span>
            <span class="value">${lowPressureStats.max} mmHg</span>
        </p>
        <p>
            <span class="label">最低值</span>
            <span class="value">${lowPressureStats.min} mmHg</span>
        </p>
        <p>
            <span class="label">平均值</span>
            <span class="value">${lowPressureStats.average} mmHg</span>
        </p>
    `;
    
    // 更新脉搏统计
    document.getElementById('pulseStats').innerHTML = `
        <p>
            <span class="label">最高值</span>
            <span class="value">${pulseStats.max} 次/分</span>
        </p>
        <p>
            <span class="label">最低值</span>
            <span class="value">${pulseStats.min} 次/分</span>
        </p>
        <p>
            <span class="label">平均值</span>
            <span class="value">${pulseStats.average} 次/分</span>
        </p>
    `;
}

// 更新数据表格
function updateTable(data) {
    const tbody = document.getElementById('dataTable');
    tbody.innerHTML = '';
    
    data.forEach(entry => {
        const row = document.createElement('tr');
        const highPressureClass = entry.highPressure > pressureSettings.highPressureMax ? 'abnormal-high' : '';
        const lowPressureClass = entry.lowPressure > pressureSettings.lowPressureMax ? 'abnormal-low' : '';
        
        row.innerHTML = `
            <td>${entry.date.toLocaleString()}</td>
            <td class="${highPressureClass}">${entry.highPressure}</td>
            <td class="${lowPressureClass}">${entry.lowPressure}</td>
            <td>${entry.pulse}</td>
        `;
        tbody.appendChild(row);
    });
}

// 创建图表
function createChart(data) {
    const bloodPressureCtx = document.getElementById('bloodPressureChart').getContext('2d');
    const pulseCtx = document.getElementById('pulseChart').getContext('2d');
    
    // 如果已存在图表，先销毁
    if (bloodPressureChart) {
        bloodPressureChart.destroy();
    }
    if (pulseChart) {
        pulseChart.destroy();
    }
    
    // 计算Y轴范围
    const highPressureValues = data.map(entry => entry.highPressure);
    const lowPressureValues = data.map(entry => entry.lowPressure);
    const pulseValues = data.map(entry => entry.pulse);
    
    const highPressureMin = Math.min(...highPressureValues);
    const highPressureMax = Math.max(...highPressureValues);
    const lowPressureMin = Math.min(...lowPressureValues);
    const lowPressureMax = Math.max(...lowPressureValues);
    const pulseMin = Math.min(...pulseValues);
    const pulseMax = Math.max(...pulseValues);
    
    // 计算平均值
    const highPressureAvg = Math.round(highPressureValues.reduce((a, b) => a + b, 0) / highPressureValues.length);
    const lowPressureAvg = Math.round(lowPressureValues.reduce((a, b) => a + b, 0) / lowPressureValues.length);
    const pulseAvg = Math.round(pulseValues.reduce((a, b) => a + b, 0) / pulseValues.length);
    
    // 设置Y轴范围，留出10%的边距
    const highPressureRange = {
        min: Math.floor(highPressureMin * 0.9),
        max: Math.ceil(highPressureMax * 1.1)
    };
    
    const lowPressureRange = {
        min: Math.floor(lowPressureMin * 0.9),
        max: Math.ceil(lowPressureMax * 1.1)
    };
    
    const pulseRange = {
        min: Math.floor(pulseMin * 0.9),
        max: Math.ceil(pulseMax * 1.1)
    };

    // 创建血压图表
    bloodPressureChart = new Chart(bloodPressureCtx, {
        id: 'bloodPressureChart',
        type: 'line',
        data: {
            labels: data.map(entry => {
                const date = new Date(entry.date);
                return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            }),
            datasets: [
                {
                    label: '高压',
                    data: data.map(entry => entry.highPressure),
                    borderColor: colorConfig.highPressure.main,
                    backgroundColor: colorConfig.highPressure.bg,
                    borderWidth: 2,
                    pointRadius: window.pointRadius || 3,
                    pointStyle: 'circle',
                    pointBackgroundColor: colorConfig.highPressure.main,
                    pointBorderColor: colorConfig.highPressure.main,
                    pointHoverRadius: window.pointHoverRadius || 3.6,
                    pointHoverBackgroundColor: colorConfig.highPressure.main,
                    pointHoverBorderColor: colorConfig.highPressure.main,
                    tension: 0.1
                },
                {
                    label: '高压平均值',
                    data: Array(data.length).fill(highPressureAvg),
                    borderColor: colorConfig.highPressure.avg,
                    backgroundColor: colorConfig.highPressure.bg,
                    borderWidth: 1,
                    pointRadius: 0,
                    pointStyle: 'circle',
                    pointBackgroundColor: colorConfig.highPressure.avg,
                    pointBorderColor: colorConfig.highPressure.avg,
                    pointHoverRadius: 0,
                    pointHoverBackgroundColor: colorConfig.highPressure.bg,
                    pointHoverBorderColor: colorConfig.highPressure.avg,
                    tension: 0.1
                },
                {
                    label: '低压',
                    data: data.map(entry => entry.lowPressure),
                    borderColor: colorConfig.lowPressure.main,
                    backgroundColor: colorConfig.lowPressure.bg,
                    borderWidth: 2,
                    pointRadius: window.pointRadius || 3,
                    pointStyle: 'circle',
                    pointBackgroundColor: colorConfig.lowPressure.main,
                    pointBorderColor: colorConfig.lowPressure.main,
                    pointHoverRadius: window.pointHoverRadius || 3.6,
                    pointHoverBackgroundColor: colorConfig.lowPressure.main,
                    pointHoverBorderColor: colorConfig.lowPressure.main,
                    tension: 0.1
                },
                {
                    label: '低压平均值',
                    data: Array(data.length).fill(lowPressureAvg),
                    borderColor: colorConfig.lowPressure.avg,
                    backgroundColor: colorConfig.lowPressure.bg,
                    borderWidth: 1,
                    pointRadius: 0,
                    pointStyle: 'circle',
                    pointBackgroundColor: colorConfig.lowPressure.avg,
                    pointBorderColor: colorConfig.lowPressure.avg,
                    pointHoverRadius: 0,
                    pointHoverBackgroundColor: colorConfig.lowPressure.bg,
                    pointHoverBorderColor: colorConfig.lowPressure.avg,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            
            scales: {
                y: {
                    beginAtZero: false,
                    min: Math.floor(lowPressureRange.min),
                    max: Math.ceil(highPressureRange.max),
                    title: {
                        display: true,
                        text: '血压 (mmHg)'
                    },
                    grid: {
                        display: true,
                        color: colorConfig.common.grid,
                        drawBorder: true,
                        drawOnChartArea: true,
                        drawTicks: true
                    },
                    position: 'left'
                },
                y1: {
                    beginAtZero: false,
                    min: Math.floor(lowPressureRange.min),
                    max: Math.ceil(highPressureRange.max),
                    position: 'right',
                    grid: {
                        display: false
                    },
                    ticks: {
                        display: false
                    },
                    afterFit: function(scale) {
                        scale.paddingRight = 80; // 为右侧标注留出空间
                    }
                },
                x: {
                    grid: {
                        display: false,
                        drawBorder: true,
                        drawOnChartArea: false,
                        drawTicks: true
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'center',
                    onClick: function(e, legendItem, legend) {
                        const index = legendItem.index;
                        const chart = legend.chart;
                        const dataset = chart.data.datasets[index];
                        
                        // 切换数据集的显示状态
                        dataset.hidden = !dataset.hidden;
                        
                        // 更新图表
                        chart.update();
                    },
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'line',
                        pointStyleWidth: 40,
                        pointStyleHeight: 1,
                        boxWidth: 40,
                        boxHeight: 1,
                        padding: 20,
                        color: colorConfig.common.text,
                        font: {
                            size: 12
                        },
                        generateLabels: function(chart) {
                            const datasets = chart.data.datasets;
                            return datasets.map((dataset, i) => ({
                                text: dataset.label,
                                fillStyle: 'transparent',
                                strokeStyle: dataset.borderColor,
                                lineWidth: dataset.borderWidth,
                                lineDash: dataset.borderDash || [],
                                hidden: dataset.hidden,
                                index: i,
                                boxWidth: 40,
                                boxHeight: 1,
                                pointStyle: 'line',
                                pointStyleWidth: 40,
                                pointStyleHeight: 1,
                                draw: function(ctx, item, x, y, w, h) {
                                    const width = 40;
                                    const height = 1;
                                    const xPos = x + (w - width) / 2;
                                    const yPos = y + (h - height) / 2;
                                    
                                    ctx.save();
                                    ctx.strokeStyle = item.strokeStyle;
                                    ctx.lineWidth = item.lineWidth;
                                    ctx.beginPath();
                                    ctx.moveTo(xPos, yPos);
                                    ctx.lineTo(xPos + width, yPos);
                                    ctx.stroke();
                                    ctx.restore();
                                }
                            }));
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            const date = new Date(data[context[0].dataIndex].date);
                            return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                        },
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y + ' mmHg';
                            }
                            return label;
                        },
                        labelColor: function(context) {
                            return {
                                borderColor: context.dataset.borderColor,
                                backgroundColor: 'transparent',
                                borderWidth: 2,
                                borderDash: [],
                                width: 40,
                                height: 1
                            };
                        }
                    },
                    displayColors: true,
                    usePointStyle: false,
                    boxWidth: 20,
                    boxHeight: 1,
                    boxPadding: 0
                },
                annotation: {
                    common: {
                        drawTime: 'afterDatasetsDraw'
                    },
                    annotations: {
                        highPressureMax: {
                            type: 'line',
                            yMin: pressureSettings.highPressureMax,
                            yMax: pressureSettings.highPressureMax,
                            borderColor: colorConfig.highPressure.limit,
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: `高压上限 ${pressureSettings.highPressureMax}mmHg`,
                                enabled: true,
                                position: 'start',
                                backgroundColor: colorConfig.highPressure.limitBg,
                                color: colorConfig.highPressure.limit
                            }
                        },
                        highPressureMin: {
                            type: 'line',
                            yMin: pressureSettings.highPressureMin,
                            yMax: pressureSettings.highPressureMin,
                            borderColor: colorConfig.highPressure.limit,
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: `高压下限 ${pressureSettings.highPressureMin}mmHg`,
                                enabled: true,
                                position: 'start',
                                backgroundColor: colorConfig.highPressure.limitBg,
                                color: colorConfig.highPressure.limit
                            }
                        },
                        lowPressureMax: {
                            type: 'line',
                            yMin: pressureSettings.lowPressureMax,
                            yMax: pressureSettings.lowPressureMax,
                            borderColor: colorConfig.lowPressure.limit,
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: `低压上限 ${pressureSettings.lowPressureMax}mmHg`,
                                enabled: true,
                                position: 'start',
                                backgroundColor: colorConfig.lowPressure.limitBg,
                                color: colorConfig.lowPressure.limit
                            }
                        },
                        lowPressureMin: {
                            type: 'line',
                            yMin: pressureSettings.lowPressureMin,
                            yMax: pressureSettings.lowPressureMin,
                            borderColor: colorConfig.lowPressure.limit,
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: `低压下限 ${pressureSettings.lowPressureMin}mmHg`,
                                enabled: true,
                                position: 'start',
                                backgroundColor: colorConfig.lowPressure.limitBg,
                                color: colorConfig.lowPressure.limit
                            }
                        },
                        highPressureAvg: {
                            type: 'line',
                            yMin: highPressureAvg,
                            yMax: highPressureAvg,
                            borderColor: colorConfig.highPressure.avg,
                            borderWidth: 2,
                            borderDash: [],
                            yScaleID: 'y1',
                            label: {
                                content: `高压平均值 ${highPressureAvg}mmHg`,
                                enabled: true,
                                position: 'right',
                                backgroundColor: colorConfig.highPressure.bg,
                                color: colorConfig.highPressure.avg,
                                xAdjust: 5,
                                yAdjust: -15,
                                padding: 4,
                                font: {
                                    size: 12
                                }
                            }
                        },
                        lowPressureAvg: {
                            type: 'line',
                            yMin: lowPressureAvg,
                            yMax: lowPressureAvg,
                            borderColor: colorConfig.lowPressure.avg,
                            borderWidth: 2,
                            borderDash: [],
                            yScaleID: 'y1',
                            label: {
                                content: `低压平均值 ${lowPressureAvg}mmHg`,
                                enabled: true,
                                position: 'right',
                                backgroundColor: colorConfig.lowPressure.bg,
                                color: colorConfig.lowPressure.avg,
                                xAdjust: 5,
                                yAdjust: 15,
                                padding: 4,
                                font: {
                                    size: 12
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    // 创建脉搏图表
    pulseChart = new Chart(pulseCtx, {
        id: 'pulseChart',
        type: 'line',
        data: {
            labels: data.map(entry => {
                const date = new Date(entry.date);
                return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
            }),
            datasets: [
                {
                    label: '脉搏',
                    data: data.map(entry => entry.pulse),
                    borderColor: colorConfig.pulse.main,
                    backgroundColor: colorConfig.pulse.bg,
                    borderWidth: 2,
                    pointRadius: window.pointRadius || 3,
                    pointStyle: 'circle',
                    pointBackgroundColor: colorConfig.pulse.main,
                    pointBorderColor: colorConfig.pulse.main,
                    pointHoverRadius: window.pointHoverRadius || 3.6,
                    pointHoverBackgroundColor: colorConfig.pulse.main,
                    pointHoverBorderColor: colorConfig.pulse.main,
                    tension: 0.1
                },
                {
                    label: '脉搏平均值',
                    data: Array(data.length).fill(pulseAvg),
                    borderColor: colorConfig.pulse.avg,
                    backgroundColor: colorConfig.pulse.bg,
                    borderWidth: 1,
                    pointRadius: 0,
                    pointStyle: 'circle',
                    pointBackgroundColor: colorConfig.pulse.avg,
                    pointBorderColor: colorConfig.pulse.avg,
                    pointHoverRadius: 0,
                    pointHoverBackgroundColor: colorConfig.pulse.bg,
                    pointHoverBorderColor: colorConfig.pulse.avg,
                    tension: 0.1
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    beginAtZero: false,
                    min: Math.floor(pulseRange.min),
                    max: Math.ceil(pulseRange.max),
                    title: {
                        display: true,
                        text: '脉搏 (次/分)'
                    },
                    grid: {
                        display: true,
                        color: colorConfig.common.grid,
                        drawBorder: true,
                        drawOnChartArea: true,
                        drawTicks: true
                    },
                    position: 'left'
                },
                y1: {
                    beginAtZero: false,
                    min: Math.floor(pulseRange.min),
                    max: Math.ceil(pulseRange.max),
                    position: 'right',
                    grid: {
                        display: false
                    },
                    ticks: {
                        display: false
                    },
                    afterFit: function(scale) {
                        scale.paddingRight = 80; // 为右侧标注留出空间
                    }
                },
                x: {
                    grid: {
                        display: false,
                        drawBorder: true,
                        drawOnChartArea: false,
                        drawTicks: true
                    }
                }
            },
            plugins: {
                legend: {
                    display: true,
                    position: 'top',
                    align: 'center',
                    onClick: function(e, legendItem, legend) {
                        const index = legendItem.index;
                        const chart = legend.chart;
                        const dataset = chart.data.datasets[index];
                        
                        // 切换数据集的显示状态
                        dataset.hidden = !dataset.hidden;
                        
                        // 更新图表
                        chart.update();
                    },
                    labels: {
                        usePointStyle: true,
                        pointStyle: 'line',
                        pointStyleWidth: 40,
                        pointStyleHeight: 1,
                        boxWidth: 40,
                        boxHeight: 1,
                        padding: 20,
                        color: colorConfig.common.text,
                        font: {
                            size: 12
                        },
                        generateLabels: function(chart) {
                            const datasets = chart.data.datasets;
                            return datasets.map((dataset, i) => ({
                                text: dataset.label,
                                fillStyle: 'transparent',
                                strokeStyle: dataset.borderColor,
                                lineWidth: dataset.borderWidth,
                                lineDash: dataset.borderDash || [],
                                hidden: dataset.hidden,
                                index: i,
                                boxWidth: 40,
                                boxHeight: 1,
                                pointStyle: 'line',
                                pointStyleWidth: 40,
                                pointStyleHeight: 1,
                                draw: function(ctx, item, x, y, w, h) {
                                    const width = 40;
                                    const height = 1;
                                    const xPos = x + (w - width) / 2;
                                    const yPos = y + (h - height) / 2;
                                    
                                    ctx.save();
                                    ctx.strokeStyle = item.strokeStyle;
                                    ctx.lineWidth = item.lineWidth;
                                    ctx.beginPath();
                                    ctx.moveTo(xPos, yPos);
                                    ctx.lineTo(xPos + width, yPos);
                                    ctx.stroke();
                                    ctx.restore();
                                }
                            }));
                        }
                    }
                },
                tooltip: {
                    callbacks: {
                        title: function(context) {
                            const date = new Date(data[context[0].dataIndex].date);
                            return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                        },
                        label: function(context) {
                            let label = context.dataset.label || '';
                            if (label) {
                                label += ': ';
                            }
                            if (context.parsed.y !== null) {
                                label += context.parsed.y + ' mmHg';
                            }
                            return label;
                        },
                        labelColor: function(context) {
                            return {
                                borderColor: context.dataset.borderColor,
                                backgroundColor: 'transparent',
                                borderWidth: 2,
                                borderDash: [],
                                width: 40,
                                height: 1
                            };
                        }
                    },
                    displayColors: true,
                    usePointStyle: false,
                    boxWidth: 20,
                    boxHeight: 1,
                    boxPadding: 0
                },
                annotation: {
                    common: {
                        drawTime: 'afterDatasetsDraw'
                    },
                    annotations: {
                        pulseAvg: {
                            type: 'line',
                            yMin: pulseAvg,
                            yMax: pulseAvg,
                            borderColor: colorConfig.pulse.avg,
                            borderWidth: 2,
                            borderDash: [],
                            yScaleID: 'y1',
                            label: {
                                content: `脉搏平均值 ${pulseAvg}次/分`,
                                enabled: true,
                                position: 'right',
                                backgroundColor: colorConfig.pulse.bg,
                                color: colorConfig.pulse.avg,
                                xAdjust: 5,
                                yAdjust: 0,
                                padding: 4,
                                font: {
                                    size: 12
                                }
                            }
                        }
                    }
                }
            }
        }
    });
}

// 应用设置
function applySettings() {
    pressureSettings.highPressureMax = parseInt(document.getElementById('highPressureMax').value);
    pressureSettings.highPressureMin = parseInt(document.getElementById('highPressureMin').value);
    pressureSettings.lowPressureMax = parseInt(document.getElementById('lowPressureMax').value);
    pressureSettings.lowPressureMin = parseInt(document.getElementById('lowPressureMin').value);
    
    // 重新加载数据并更新显示
    const fileInput = document.getElementById('csvFile');
    if (fileInput.files.length > 0) {
        loadDataFromFile(fileInput.files[0]).then(rawData => {
            if (rawData.length > 0) {
                const { originalCount, processedData } = preprocessData(rawData);
                updateStats(processedData, originalCount);
                updateTable(processedData);
                createChart(processedData);
            }
        });
    }
}

// 页面加载完成后初始化
document.addEventListener('DOMContentLoaded', init); 

window.pointRadius = 2.8;  // 设置数据点大小为4
window.pointHoverRadius = 3.6;  // 设置悬停时数据点大小为5
bloodPressureChart.update();  // 更新图表
pulseChart.update();  // 更新图表 

// 更新图表
function updateCharts() {
    if (bloodPressureChart) {
        bloodPressureChart.destroy();
        bloodPressureChart = null;
    }
    if (pulseChart) {
        pulseChart.destroy();
        pulseChart = null;
    }
    
    // 重新创建图表
    createCharts();
}

// 应用设置按钮点击事件
document.getElementById('applySettings').addEventListener('click', function() {
    // 更新设置
    pressureSettings.highPressureMin = parseInt(document.getElementById('highPressureMin').value);
    pressureSettings.highPressureMax = parseInt(document.getElementById('highPressureMax').value);
    pressureSettings.lowPressureMin = parseInt(document.getElementById('lowPressureMin').value);
    pressureSettings.lowPressureMax = parseInt(document.getElementById('lowPressureMax').value);
    
    // 更新图表
    updateCharts();
});

// 创建图表
function createCharts() {
    // 创建血压图表
    bloodPressureChart = new Chart(bloodPressureCtx, {
        type: 'line',
        data: {
            labels: data.map(entry => entry.date),
            datasets: [
                // ... datasets configuration ...
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    beginAtZero: false,
                    min: Math.floor(pressureRange.min),
                    max: Math.ceil(pressureRange.max),
                    title: {
                        display: true,
                        text: '血压 (mmHg)'
                    },
                    grid: {
                        display: true,
                        color: colorConfig.common.grid,
                        drawBorder: true,
                        drawOnChartArea: true,
                        drawTicks: true
                    }
                },
                x: {
                    grid: {
                        display: false,
                        drawBorder: true,
                        drawOnChartArea: false,
                        drawTicks: true
                    }
                }
            },
            plugins: {
                legend: {
                    // ... legend configuration ...
                },
                tooltip: {
                    // ... tooltip configuration ...
                },
                annotation: {
                    common: {
                        drawTime: 'afterDatasetsDraw'
                    },
                    annotations: {
                        highPressureMax: {
                            type: 'line',
                            yMin: pressureSettings.highPressureMax,
                            yMax: pressureSettings.highPressureMax,
                            borderColor: colorConfig.highPressure.limit,
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: `高压上限 ${pressureSettings.highPressureMax}mmHg`,
                                enabled: true,
                                position: 'start',
                                backgroundColor: colorConfig.highPressure.limitBg,
                                color: colorConfig.highPressure.limit
                            }
                        },
                        highPressureMin: {
                            type: 'line',
                            yMin: pressureSettings.highPressureMin,
                            yMax: pressureSettings.highPressureMin,
                            borderColor: colorConfig.highPressure.limit,
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: `高压下限 ${pressureSettings.highPressureMin}mmHg`,
                                enabled: true,
                                position: 'start',
                                backgroundColor: colorConfig.highPressure.limitBg,
                                color: colorConfig.highPressure.limit
                            }
                        },
                        lowPressureMax: {
                            type: 'line',
                            yMin: pressureSettings.lowPressureMax,
                            yMax: pressureSettings.lowPressureMax,
                            borderColor: colorConfig.lowPressure.limit,
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: `低压上限 ${pressureSettings.lowPressureMax}mmHg`,
                                enabled: true,
                                position: 'start',
                                backgroundColor: colorConfig.lowPressure.limitBg,
                                color: colorConfig.lowPressure.limit
                            }
                        },
                        lowPressureMin: {
                            type: 'line',
                            yMin: pressureSettings.lowPressureMin,
                            yMax: pressureSettings.lowPressureMin,
                            borderColor: colorConfig.lowPressure.limit,
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: `低压下限 ${pressureSettings.lowPressureMin}mmHg`,
                                enabled: true,
                                position: 'start',
                                backgroundColor: colorConfig.lowPressure.limitBg,
                                color: colorConfig.lowPressure.limit
                            }
                        },
                        highPressureAvg: {
                            type: 'line',
                            yMin: highPressureAvg,
                            yMax: highPressureAvg,
                            borderColor: colorConfig.highPressure.avg,
                            borderWidth: 2,
                            borderDash: [],
                            yScaleID: 'y1',
                            label: {
                                content: `高压平均值 ${highPressureAvg}mmHg`,
                                enabled: true,
                                position: 'right',
                                backgroundColor: colorConfig.highPressure.bg,
                                color: colorConfig.highPressure.avg,
                                xAdjust: 5,
                                yAdjust: -15,
                                padding: 4,
                                font: {
                                    size: 12
                                }
                            }
                        },
                        lowPressureAvg: {
                            type: 'line',
                            yMin: lowPressureAvg,
                            yMax: lowPressureAvg,
                            borderColor: colorConfig.lowPressure.avg,
                            borderWidth: 2,
                            borderDash: [],
                            yScaleID: 'y1',
                            label: {
                                content: `低压平均值 ${lowPressureAvg}mmHg`,
                                enabled: true,
                                position: 'right',
                                backgroundColor: colorConfig.lowPressure.bg,
                                color: colorConfig.lowPressure.avg,
                                xAdjust: 5,
                                yAdjust: 15,
                                padding: 4,
                                font: {
                                    size: 12
                                }
                            }
                        }
                    }
                }
            }
        }
    });

    // 创建脉搏图表
    pulseChart = new Chart(pulseCtx, {
        type: 'line',
        data: {
            // ... data configuration ...
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            interaction: {
                mode: 'index',
                intersect: false,
            },
            scales: {
                y: {
                    beginAtZero: false,
                    min: Math.floor(pulseRange.min),
                    max: Math.ceil(pulseRange.max),
                    title: {
                        display: true,
                        text: '脉搏 (次/分)'
                    },
                    grid: {
                        display: true,
                        color: colorConfig.common.grid,
                        drawBorder: true,
                        drawOnChartArea: true,
                        drawTicks: true
                    },
                    position: 'left'
                },
                y1: {
                    beginAtZero: false,
                    min: Math.floor(pulseRange.min),
                    max: Math.ceil(pulseRange.max),
                    position: 'right',
                    grid: {
                        display: false
                    },
                    ticks: {
                        display: false
                    },
                    afterFit: function(scale) {
                        scale.paddingRight = 80; // 为右侧标注留出空间
                    }
                },
                x: {
                    grid: {
                        display: false,
                        drawBorder: true,
                        drawOnChartArea: false,
                        drawTicks: true
                    }
                }
            },
            plugins: {
                legend: {
                    // ... legend configuration ...
                },
                tooltip: {
                    // ... tooltip configuration ...
                },
                annotation: {
                    common: {
                        drawTime: 'afterDatasetsDraw'
                    },
                    annotations: {
                        pulseAvg: {
                            type: 'line',
                            yMin: pulseAvg,
                            yMax: pulseAvg,
                            borderColor: colorConfig.pulse.avg,
                            borderWidth: 2,
                            borderDash: [],
                            yScaleID: 'y1',
                            label: {
                                content: `脉搏平均值 ${pulseAvg}次/分`,
                                enabled: true,
                                position: 'right',
                                backgroundColor: colorConfig.pulse.bg,
                                color: colorConfig.pulse.avg,
                                xAdjust: 5,
                                yAdjust: 0,
                                padding: 4,
                                font: {
                                    size: 12
                                }
                            }
                        }
                    }
                }
            }
        }
    });
} 