// 全局变量
let chart = null;
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
    const ctx = document.getElementById('bloodPressureChart').getContext('2d');
    
    // 如果已存在图表，先销毁
    if (chart) {
        chart.destroy();
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
    
    // 创建图表
    chart = new Chart(ctx, {
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
                    borderColor: 'rgb(255, 99, 132)',
                    backgroundColor: 'rgba(255, 99, 132, 0.5)',
                    tension: 0.1,
                    pointBackgroundColor: data.map(entry => 
                        entry.highPressure > pressureSettings.highPressureMax ? 'rgb(255, 0, 0)' : 'rgba(255, 99, 132, 0.5)'
                    ),
                    pointRadius: data.map(entry => 
                        entry.highPressure > pressureSettings.highPressureMax ? 3.8 : 3
                    ),
                    pointHoverRadius: data.map(entry => 
                        entry.highPressure > pressureSettings.highPressureMax ? 5.0 : 3.9
                    ),
                    yAxisID: 'y'
                },
                {
                    label: '低压',
                    data: data.map(entry => entry.lowPressure),
                    borderColor: data.map(entry => 
                        entry.lowPressure > pressureSettings.lowPressureMax ? 'rgb(252, 117, 7)' : 'rgba(54, 162, 235, 0.5)'
                    ),
                    backgroundColor: data.map(entry => 
                        entry.lowPressure > pressureSettings.lowPressureMax ? 'rgb(252, 117, 7)' : 'rgba(54, 162, 235, 0.5)'
                    ),
                    tension: 0.1,
                    pointBackgroundColor: data.map(entry => 
                        entry.lowPressure > pressureSettings.lowPressureMax ? 'rgb(252, 117, 7)' : 'rgba(54, 162, 235, 0.5)'
                    ),
                    pointRadius: data.map(entry => 
                        entry.lowPressure > pressureSettings.lowPressureMax ? 3.8 : 3
                    ),
                    pointHoverRadius: data.map(entry => 
                        entry.lowPressure > pressureSettings.lowPressureMax ? 5.0 : 3.9
                    ),
                    yAxisID: 'y'
                },
                {
                    label: '脉搏',
                    data: data.map(entry => entry.pulse),
                    borderColor: 'rgba(75, 192, 192, 0.5)',
                    backgroundColor: 'rgba(75, 192, 192, 0.5)',
                    tension: 0.1,
                    pointBackgroundColor: 'rgba(75, 192, 192, 0.5)',
                    pointRadius: 3,
                    pointHoverRadius: 3.9,
                    yAxisID: 'pulse'
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
                    position: 'left',
                    title: {
                        display: true,
                        text: '血压 (mmHg)'
                    }
                },
                pulse: {
                    beginAtZero: false,
                    min: Math.floor(pulseRange.min),
                    max: Math.ceil(pulseRange.max),
                    position: 'right',
                    title: {
                        display: true,
                        text: '脉搏 (次/分)'
                    },
                    grid: {
                        drawOnChartArea: false
                    }
                }
            },
            plugins: {
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
                                label += context.parsed.y;
                                if (context.dataset.yAxisID === 'pulse') {
                                    label += ' 次/分';
                                } else {
                                    label += ' mmHg';
                                }
                            }
                            return label;
                        }
                    }
                },
                annotation: {
                    annotations: {
                        highPressureMax: {
                            type: 'line',
                            yMin: pressureSettings.highPressureMax,
                            yMax: pressureSettings.highPressureMax,
                            borderColor: 'rgb(255, 0, 0)',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: `高压上限 ${pressureSettings.highPressureMax}mmHg`,
                                enabled: true,
                                position: 'start',
                                backgroundColor: 'rgba(255, 0, 0, 0.1)',
                                color: 'rgb(255, 0, 0)'
                            }
                        },
                        highPressureMin: {
                            type: 'line',
                            yMin: pressureSettings.highPressureMin,
                            yMax: pressureSettings.highPressureMin,
                            borderColor: 'rgb(255, 0, 0)',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: `高压下限 ${pressureSettings.highPressureMin}mmHg`,
                                enabled: true,
                                position: 'start',
                                backgroundColor: 'rgba(255, 0, 0, 0.1)',
                                color: 'rgb(255, 0, 0)'
                            }
                        },
                        lowPressureMax: {
                            type: 'line',
                            yMin: pressureSettings.lowPressureMax,
                            yMax: pressureSettings.lowPressureMax,
                            borderColor: 'rgb(252, 117, 7)',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: `低压上限 ${pressureSettings.lowPressureMax}mmHg`,
                                enabled: true,
                                position: 'start',
                                backgroundColor: 'rgba(252, 117, 7, 0.1)',
                                color: 'rgb(252, 117, 7)'
                            }
                        },
                        lowPressureMin: {
                            type: 'line',
                            yMin: pressureSettings.lowPressureMin,
                            yMax: pressureSettings.lowPressureMin,
                            borderColor: 'rgb(252, 117, 7)',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            label: {
                                content: `低压下限 ${pressureSettings.lowPressureMin}mmHg`,
                                enabled: true,
                                position: 'start',
                                backgroundColor: 'rgba(252, 117, 7, 0.1)',
                                color: 'rgb(252, 117, 7)'
                            }
                        },
                        highPressureAvg: {
                            type: 'line',
                            yMin: highPressureAvg,
                            yMax: highPressureAvg,
                            borderColor: 'rgb(255, 99, 132)',
                            borderWidth: 2,
                            borderDash: [],
                            label: {
                                content: `高压平均值 ${highPressureAvg}mmHg`,
                                enabled: true,
                                position: 'start',
                                backgroundColor: 'rgba(255, 99, 132, 0.1)',
                                color: 'rgb(255, 99, 132)'
                            }
                        },
                        lowPressureAvg: {
                            type: 'line',
                            yMin: lowPressureAvg,
                            yMax: lowPressureAvg,
                            borderColor: 'rgb(54, 162, 235)',
                            borderWidth: 2,
                            borderDash: [],
                            label: {
                                content: `低压平均值 ${lowPressureAvg}mmHg`,
                                enabled: true,
                                position: 'start',
                                backgroundColor: 'rgba(54, 162, 235, 0.1)',
                                color: 'rgb(54, 162, 235)'
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