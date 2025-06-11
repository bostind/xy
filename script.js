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
    const headers = lines[0].split(/[\t,]/).map(h => h.trim().replace(/^["']|["']$/g, '')); // 支持制表符和逗号分隔，并移除引号
    
    // 查找所需列的索引
    const findColumnIndex = (possibleNames) => {
        for (const name of possibleNames) {
            const index = headers.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));
            if (index !== -1) return index;
        }
        return -1;
    };

    // 查找各列的索引
    const dateIndex = findColumnIndex(['日期', 'date', '时间', 'time', '测量时间', '测量日期']);
    const highPressureIndex = findColumnIndex(['高压', 'high', '收缩压', 'systolic', '收缩']);
    const lowPressureIndex = findColumnIndex(['低压', 'low', '舒张压', 'diastolic', '舒张']);
    const pulseIndex = findColumnIndex(['脉搏', 'pulse', '心率', 'heart rate', '心跳']);

    // 验证必要的列是否存在
    if (dateIndex === -1 || highPressureIndex === -1 || lowPressureIndex === -1 || pulseIndex === -1) {
        throw new Error('CSV文件格式错误：缺少必要的列（日期、高压、低压、脉搏）');
    }

    const data = [];
    let errorLines = [];
    
    // 解析CSV行
    function parseCSVLine(line) {
        const result = [];
        let current = '';
        let inQuotes = false;
        
        for (let i = 0; i < line.length; i++) {
            const char = line[i];
            
            if (char === '"' || char === "'") {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                result.push(current.trim().replace(/^["']|["']$/g, ''));
                current = '';
            } else {
                current += char;
            }
        }
        
        // 添加最后一个字段
        result.push(current.trim().replace(/^["']|["']$/g, ''));
        return result;
    }
    
    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        
        try {
            const values = parseCSVLine(lines[i]);
            
            // 只提取必要的四列数据
            const date = parseDate(values[dateIndex]);
            const highPressure = parseInt(values[highPressureIndex]);
            const lowPressure = parseInt(values[lowPressureIndex]);
            const pulse = parseInt(values[pulseIndex]);

            // 验证数值
            if (isNaN(highPressure) || isNaN(lowPressure) || isNaN(pulse)) {
                throw new Error('数值格式错误');
            }

            // 验证数值范围
            if (highPressure < 60 || highPressure > 250) {
                throw new Error('高压数值超出正常范围');
            }
            if (lowPressure < 40 || lowPressure > 150) {
                throw new Error('低压数值超出正常范围');
            }
            if (pulse < 40 || pulse > 200) {
                throw new Error('脉搏数值超出正常范围');
            }

            data.push({
                date: date,
                highPressure: highPressure,
                lowPressure: lowPressure,
                pulse: pulse
            });
        } catch (error) {
            errorLines.push({
                line: i + 1,
                content: lines[i],
                error: error.message
            });
        }
    }

    // 如果有错误行，显示错误信息
    if (errorLines.length > 0) {
        const errorMessage = `发现 ${errorLines.length} 行数据格式错误：\n` +
            errorLines.map(e => `第 ${e.line} 行: ${e.error}\n数据: ${e.content}`).join('\n');
        console.warn(errorMessage);
        // 显示错误信息到UI
        const fileInfo = document.getElementById('fileInfo');
        if (fileInfo) {
            fileInfo.innerHTML = `<span style="color: red;">发现 ${errorLines.length} 行数据格式错误，请检查数据格式</span>`;
        }
    }

    return data;
}

// 解析日期字符串
function parseDate(dateStr) {
    // 移除多余的空格和引号
    dateStr = dateStr.trim().replace(/^["']|["']$/g, '');
    
    // 尝试多种日期格式
    const formats = [
        // YYYY-MM-DD HH:mm:ss
        /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/,
        // YYYY/MM/DD HH:mm:ss
        /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})$/,
        // YYYY-MM-DD HH:mm
        /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2})$/,
        // YYYY/MM/DD HH:mm
        /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2})$/,
        // YYYY-MM-DD HH:mm:ss.SSS
        /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})\.(\d{1,3})$/,
        // YYYY/MM/DD HH:mm:ss.SSS
        /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2})\.(\d{1,3})$/,
        // YYYY-MM-DD HH:mm:ss,SSS
        /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2}),(\d{1,3})$/,
        // YYYY/MM/DD HH:mm:ss,SSS
        /^(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{1,2}):(\d{1,2}),(\d{1,3})$/
    ];

    for (const format of formats) {
        const match = dateStr.match(format);
        if (match) {
            const [_, year, month, day, hour, minute, second = '00'] = match;
            return new Date(year, month - 1, day, hour, minute, second);
        }
    }

    throw new Error(`无法解析日期格式: ${dateStr}`);
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

// 日期时间格式化函数
function formatDateTime(date, format = 'full') {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    const seconds = String(date.getSeconds()).padStart(2, '0');

    switch (format) {
        case 'full':
            return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
        case 'date':
            return `${year}/${month}/${day}`;
        case 'time':
            return `${hours}:${minutes}`;
        case 'compact':
            return `${month}/${day} ${hours}:${minutes}`;
        case 'short':
            return `${month}-${day} ${hours}:${minutes}`;
        default:
            return `${year}/${month}/${day} ${hours}:${minutes}`;
    }
}

// 智能日期时间格式化
function smartFormatDateTime(date) {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const dateOnly = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    
    if (dateOnly.getTime() === today.getTime()) {
        return `今天 ${formatDateTime(date, 'time')}`;
    } else if (dateOnly.getTime() === yesterday.getTime()) {
        return `昨天 ${formatDateTime(date, 'time')}`;
    } else if (date.getFullYear() === now.getFullYear()) {
        return formatDateTime(date, 'compact');
    } else {
        return formatDateTime(date, 'short');
    }
}

// 更新数据表格
function updateTable(data) {
    const table = document.getElementById('dataTable').parentElement;
    const tbody = document.getElementById('dataTable');
    
    // 清空表格内容
    table.innerHTML = '';
    
    // 创建表头
    const thead = document.createElement('thead');
    thead.innerHTML = `
        <tr>
            <th style="min-width: 180px;" class="date-column">测量时间</th>
            <th style="min-width: 100px;">高压 (mmHg)</th>
            <th style="min-width: 100px;">低压 (mmHg)</th>
            <th style="min-width: 100px;">脉搏 (次/分)</th>
        </tr>
    `;
    
    // 重新创建tbody
    const newTbody = document.createElement('tbody');
    newTbody.id = 'dataTable';
    
    // 添加表头和数据行
    table.appendChild(thead);
    table.appendChild(newTbody);
    
    // 添加数据行
    data.forEach(entry => {
        const row = document.createElement('tr');
        const highPressureClass = entry.highPressure > pressureSettings.highPressureMax ? 'abnormal-high' : '';
        const lowPressureClass = entry.lowPressure > pressureSettings.lowPressureMax ? 'abnormal-low' : '';
        
        // 格式化时间显示
        const date = new Date(entry.date);
        const fullDateTime = formatDateTime(date, 'full');
        const smartDateTime = smartFormatDateTime(date);
        
        row.innerHTML = `
            <td class="date-cell" title="${fullDateTime}">${smartDateTime}</td>
            <td class="${highPressureClass}" title="${entry.highPressure} mmHg">${entry.highPressure}</td>
            <td class="${lowPressureClass}" title="${entry.lowPressure} mmHg">${entry.lowPressure}</td>
            <td title="${entry.pulse} 次/分">${entry.pulse}</td>
        `;
        newTbody.appendChild(row);
    });
    
    // 添加表格排序功能
    const headers = thead.getElementsByTagName('th');
    for (let i = 0; i < headers.length; i++) {
        headers[i].addEventListener('click', function() {
            sortTable(i);
        });
        headers[i].style.cursor = 'pointer';
        headers[i].title = '点击排序';
    }
}

// 表格排序函数
function sortTable(columnIndex) {
    const table = document.getElementById('dataTable').parentElement;
    const tbody = document.getElementById('dataTable');
    const rows = Array.from(tbody.getElementsByTagName('tr'));
    const header = table.getElementsByTagName('th')[columnIndex];
    
    // 切换排序方向
    const isAscending = header.classList.contains('asc') ? false : true;
    
    // 移除所有表头的排序标记
    Array.from(table.getElementsByTagName('th')).forEach(th => {
        th.classList.remove('asc', 'desc');
    });
    
    // 添加当前排序方向标记
    header.classList.add(isAscending ? 'asc' : 'desc');
    
    // 排序行
    rows.sort((a, b) => {
        const aValue = a.cells[columnIndex].textContent.trim();
        const bValue = b.cells[columnIndex].textContent.trim();
        
        if (columnIndex === 0) {
            // 日期列特殊处理
            return isAscending ? 
                new Date(aValue) - new Date(bValue) : 
                new Date(bValue) - new Date(aValue);
        } else {
            // 数值列处理
            const aNum = parseInt(aValue);
            const bNum = parseInt(bValue);
            return isAscending ? aNum - bNum : bNum - aNum;
        }
    });
    
    // 重新插入排序后的行
    rows.forEach(row => tbody.appendChild(row));
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