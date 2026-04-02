const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Routes kiểm tra
app.get('/', (req, res) => {
    res.json({ message: 'AutoVip API is running!', status: 'ok', time: new Date().toISOString() });
});

app.get('/api/test', (req, res) => {
    res.json({ success: true, message: 'API test is working!', endpoints: ['/api/cars', '/api/brands', '/api/auth/login'] });
});

app.get('/api/db-test', (req, res) => {
    db.query('SELECT 1+1 AS result', (err, results) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        res.json({ success: true, data: results });
    });
});

// Kết nối MySQL
const db = mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT || 3306
});

db.connect((err) => {
    if (err) {
        console.error('Lỗi kết nối database:', err);
    } else {
        console.log('✅ Đã kết nối database thành công!');
    }
});

// ========== JWT SECRET ==========
const JWT_SECRET = process.env.JWT_SECRET || 'autovip_secret_key_2024';

// ========== MIDDLEWARE ==========
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ success: false, message: 'Chưa đăng nhập' });
    }
    
    jwt.verify(token, JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ success: false, message: 'Token không hợp lệ' });
        }
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ success: false, message: 'Bạn không có quyền truy cập' });
    }
};

// ==================== API CƠ BẢN ====================

// Lấy danh sách xe
app.get('/api/cars', (req, res) => {
    const { sort, brand } = req.query;
    let sql = 'SELECT * FROM cars WHERE 1=1';
    const params = [];

    if (brand && brand !== 'all') {
        sql += ' AND brand = ?';
        params.push(brand);
    }

    if (sort === 'price_asc') {
        sql += ' ORDER BY price ASC';
    } else if (sort === 'price_desc') {
        sql += ' ORDER BY price DESC';
    } else if (sort === 'year_desc') {
        sql += ' ORDER BY year DESC';
    } else {
        sql += ' ORDER BY id DESC';
    }

    db.query(sql, params, (err, results) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, data: results, count: results.length });
        }
    });
});

// Lấy xe nổi bật (6 xe)
app.get('/api/cars/featured', (req, res) => {
    db.query('SELECT * FROM cars ORDER BY id DESC LIMIT 6', (err, results) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, data: results });
        }
    });
});

// Lấy danh sách thương hiệu
app.get('/api/brands', (req, res) => {
    db.query('SELECT DISTINCT brand FROM cars ORDER BY brand', (err, results) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, data: results });
        }
    });
});

// ========== API TÌM KIẾM ==========
app.get('/api/cars/search', (req, res) => {
    const keyword = req.query.keyword;
    
    console.log('🔍 Tìm kiếm với từ khóa:', keyword);
    
    if (!keyword || keyword.trim() === '') {
        return res.json({ success: true, data: [], message: 'Vui lòng nhập từ khóa' });
    }
    
    const searchTerm = `%${keyword.trim()}%`;
    const sql = 'SELECT * FROM cars WHERE name LIKE ? OR brand LIKE ? LIMIT 50';
    
    db.query(sql, [searchTerm, searchTerm], (err, results) => {
        if (err) {
            console.error('❌ Lỗi tìm kiếm:', err);
            return res.status(500).json({ success: false, error: err.message });
        }
        
        console.log(`✅ Tìm thấy ${results.length} kết quả cho "${keyword}"`);
        res.json({ success: true, data: results, count: results.length });
    });
});

// Lấy chi tiết 1 xe
app.get('/api/cars/:id', (req, res) => {
    const id = req.params.id;
    
    console.log('📌 Nhận request lấy xe ID:', id);
    
    if (!id || isNaN(id)) {
        console.log('❌ ID không hợp lệ:', id);
        return res.status(400).json({ success: false, message: 'ID xe không hợp lệ' });
    }
    
    db.query('SELECT * FROM cars WHERE id = ?', [id], (err, results) => {
        if (err) {
            console.error('❌ Lỗi query:', err);
            res.status(500).json({ success: false, error: err.message });
        } else if (results.length === 0) {
            console.log('❌ Không tìm thấy xe ID:', id);
            res.status(404).json({ success: false, message: 'Không tìm thấy xe' });
        } else {
            console.log('✅ Tìm thấy xe:', results[0].name);
            res.json({ success: true, data: results[0] });
        }
    });
});

// ==================== API AUTH ====================

// Đăng ký
app.post('/api/auth/register', async (req, res) => {
    try {
        const { fullname, email, password, phone } = req.body;
        
        db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
            
            if (results.length > 0) {
                return res.status(400).json({ success: false, message: 'Email đã được sử dụng' });
            }
            
            const hashedPassword = await bcrypt.hash(password, 10);
            
            db.query(
                'INSERT INTO users (fullname, email, password, phone) VALUES (?, ?, ?, ?)',
                [fullname, email, hashedPassword, phone],
                (err, result) => {
                    if (err) {
                        return res.status(500).json({ success: false, error: err.message });
                    }
                    
                    const token = jwt.sign(
                        { id: result.insertId, email, role: 'user' },
                        JWT_SECRET,
                        { expiresIn: '7d' }
                    );
                    
                    res.json({
                        success: true,
                        message: 'Đăng ký thành công',
                        token,
                        user: {
                            id: result.insertId,
                            fullname,
                            email,
                            role: 'user'
                        }
                    });
                }
            );
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// Đăng nhập
app.post('/api/auth/login', (req, res) => {
    try {
        const { email, password } = req.body;
        
        db.query('SELECT * FROM users WHERE email = ?', [email], async (err, results) => {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
            
            if (results.length === 0) {
                return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không đúng' });
            }
            
            const user = results[0];
            const isPasswordValid = await bcrypt.compare(password, user.password);
            
            if (!isPasswordValid) {
                return res.status(401).json({ success: false, message: 'Email hoặc mật khẩu không đúng' });
            }
            
            const token = jwt.sign(
                { id: user.id, email: user.email, role: user.role },
                JWT_SECRET,
                { expiresIn: '7d' }
            );
            
            res.json({
                success: true,
                message: 'Đăng nhập thành công',
                token,
                user: {
                    id: user.id,
                    fullname: user.fullname,
                    email: user.email,
                    role: user.role
                }
            });
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// ==================== API GIỎ HÀNG ====================

// Thêm vào giỏ hàng
app.post('/api/cart', authenticateToken, (req, res) => {
    const { car_id, quantity = 1 } = req.body;
    const user_id = req.user.id;
    
    db.query(
        'INSERT INTO cart (user_id, car_id, quantity) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE quantity = quantity + ?',
        [user_id, car_id, quantity, quantity],
        (err, result) => {
            if (err) {
                res.status(500).json({ success: false, error: err.message });
            } else {
                res.json({ success: true, message: 'Đã thêm vào giỏ hàng' });
            }
        }
    );
});

// Lấy giỏ hàng
app.get('/api/cart', authenticateToken, (req, res) => {
    const user_id = req.user.id;
    
    db.query(`
        SELECT c.*, cart.quantity, cart.id as cart_id 
        FROM cart 
        JOIN cars c ON cart.car_id = c.id 
        WHERE cart.user_id = ?
    `, [user_id], (err, results) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            const total = results.reduce((sum, item) => sum + (item.price * item.quantity), 0);
            res.json({ 
                success: true, 
                items: results,
                total: total,
                count: results.length
            });
        }
    });
});

// Cập nhật số lượng
app.put('/api/cart/:cartId', authenticateToken, (req, res) => {
    const { cartId } = req.params;
    const { quantity } = req.body;
    const user_id = req.user.id;
    
    if (quantity <= 0) {
        db.query('DELETE FROM cart WHERE id = ? AND user_id = ?', [cartId, user_id], (err) => {
            if (err) {
                res.status(500).json({ success: false, error: err.message });
            } else {
                res.json({ success: true, message: 'Đã xóa khỏi giỏ hàng' });
            }
        });
    } else {
        db.query(
            'UPDATE cart SET quantity = ? WHERE id = ? AND user_id = ?',
            [quantity, cartId, user_id],
            (err) => {
                if (err) {
                    res.status(500).json({ success: false, error: err.message });
                } else {
                    res.json({ success: true, message: 'Cập nhật thành công' });
                }
            }
        );
    }
});

// Xóa khỏi giỏ hàng
app.delete('/api/cart/:cartId', authenticateToken, (req, res) => {
    const { cartId } = req.params;
    const user_id = req.user.id;
    
    db.query('DELETE FROM cart WHERE id = ? AND user_id = ?', [cartId, user_id], (err) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, message: 'Đã xóa khỏi giỏ hàng' });
        }
    });
});

// ==================== API ĐƠN HÀNG ====================

// Tạo đơn hàng
app.post('/api/orders', authenticateToken, (req, res) => {
    const user_id = req.user.id;
    const { shipping_address, shipping_phone, shipping_name, note, payment_method } = req.body;
    
    db.query(`
        SELECT c.*, cart.quantity 
        FROM cart 
        JOIN cars c ON cart.car_id = c.id 
        WHERE cart.user_id = ?
    `, [user_id], (err, cartItems) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        
        if (cartItems.length === 0) {
            return res.status(400).json({ success: false, message: 'Giỏ hàng trống' });
        }
        
        const total_amount = cartItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
        const order_code = 'ORD' + Date.now() + Math.floor(Math.random() * 1000);
        
        db.query(
            `INSERT INTO orders (user_id, order_code, total_amount, shipping_address, shipping_phone, shipping_name, note, payment_method) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [user_id, order_code, total_amount, shipping_address, shipping_phone, shipping_name, note, payment_method],
            (err, result) => {
                if (err) {
                    return res.status(500).json({ success: false, error: err.message });
                }
                
                const order_id = result.insertId;
                const orderItems = cartItems.map(item => [order_id, item.id, item.quantity, item.price]);
                
                db.query(
                    'INSERT INTO order_items (order_id, car_id, quantity, price) VALUES ?',
                    [orderItems],
                    (err) => {
                        if (err) {
                            return res.status(500).json({ success: false, error: err.message });
                        }
                        
                        db.query('DELETE FROM cart WHERE user_id = ?', [user_id], (err) => {
                            if (err) console.error('Lỗi xóa giỏ:', err);
                            res.json({ 
                                success: true, 
                                message: 'Đặt hàng thành công',
                                order: { id: order_id, order_code, total_amount }
                            });
                        });
                    }
                );
            }
        );
    });
});

// Lấy danh sách đơn hàng của user
app.get('/api/orders', authenticateToken, (req, res) => {
    const user_id = req.user.id;
    
    db.query(`
        SELECT o.*, COUNT(oi.id) as items_count
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.user_id = ?
        GROUP BY o.id
        ORDER BY o.created_at DESC
    `, [user_id], (err, results) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, orders: results });
        }
    });
});

// Lấy chi tiết đơn hàng của user
app.get('/api/orders/:orderId', authenticateToken, (req, res) => {
    const user_id = req.user.id;
    const { orderId } = req.params;
    
    db.query(`
        SELECT o.*, oi.car_id, oi.quantity, oi.price, c.name as car_name, c.image_url
        FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        JOIN cars c ON oi.car_id = c.id
        WHERE o.id = ? AND o.user_id = ?
    `, [orderId, user_id], (err, results) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else if (results.length === 0) {
            res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
        } else {
            const order = {
                id: results[0].id,
                order_code: results[0].order_code,
                total_amount: results[0].total_amount,
                status: results[0].status,
                payment_method: results[0].payment_method,
                payment_status: results[0].payment_status,
                shipping_address: results[0].shipping_address,
                shipping_phone: results[0].shipping_phone,
                shipping_name: results[0].shipping_name,
                note: results[0].note,
                created_at: results[0].created_at,
                items: results.map(item => ({
                    car_id: item.car_id,
                    car_name: item.car_name,
                    quantity: item.quantity,
                    price: item.price,
                    image_url: item.image_url
                }))
            };
            res.json({ success: true, order });
        }
    });
});

// ==================== API ĐẶT LỊCH LÁI THỬ ====================

// Đặt lịch lái thử
app.post('/api/testdrive', authenticateToken, (req, res) => {
    const { car_id, fullname, email, phone, test_date, test_time, notes } = req.body;
    const user_id = req.user.id;
    
    db.query(
        'INSERT INTO test_drives (user_id, car_id, fullname, email, phone, test_date, test_time, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [user_id, car_id, fullname, email, phone, test_date, test_time, notes],
        (err, result) => {
            if (err) {
                res.status(500).json({ success: false, error: err.message });
            } else {
                res.json({ success: true, message: 'Đặt lịch thành công' });
            }
        }
    );
});

// Lấy lịch sử đặt lịch của user
app.get('/api/user/testdrives', authenticateToken, (req, res) => {
    const user_id = req.user.id;
    
    db.query(`
        SELECT td.*, c.name as car_name 
        FROM test_drives td 
        JOIN cars c ON td.car_id = c.id 
        WHERE td.user_id = ? 
        ORDER BY td.created_at DESC
    `, [user_id], (err, results) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json(results);
        }
    });
});

// ==================== API ADMIN ====================

// Quản lý users
app.get('/api/admin/users', authenticateToken, isAdmin, (req, res) => {
    db.query('SELECT id, fullname, email, phone, role, created_at FROM users ORDER BY id DESC', 
        (err, results) => {
            if (err) {
                res.status(500).json({ success: false, error: err.message });
            } else {
                res.json(results);
            }
        }
    );
});

app.put('/api/admin/users/:id/role', authenticateToken, isAdmin, (req, res) => {
    const id = req.params.id;
    const { role } = req.body;
    
    db.query('UPDATE users SET role=? WHERE id=?', [role, id], (err, result) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, message: 'Cập nhật role thành công' });
        }
    });
});

app.delete('/api/admin/users/:id', authenticateToken, isAdmin, (req, res) => {
    const id = req.params.id;
    
    db.query('DELETE FROM users WHERE id = ?', [id], (err, result) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, message: 'Xóa user thành công' });
        }
    });
});

// Quản lý lịch lái thử
app.get('/api/admin/testdrives', authenticateToken, isAdmin, (req, res) => {
    db.query(`
        SELECT td.*, c.name as car_name, u.fullname as user_name 
        FROM test_drives td 
        LEFT JOIN cars c ON td.car_id = c.id 
        LEFT JOIN users u ON td.user_id = u.id 
        ORDER BY td.created_at DESC
    `, (err, results) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json(results);
        }
    });
});

app.put('/api/admin/testdrives/:id/status', authenticateToken, isAdmin, (req, res) => {
    const id = req.params.id;
    const { status } = req.body;
    
    db.query('UPDATE test_drives SET status=? WHERE id=?', [status, id], (err, result) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, message: 'Cập nhật trạng thái thành công' });
        }
    });
});

// Quản lý xe
app.post('/api/admin/cars', authenticateToken, isAdmin, (req, res) => {
    const { name, brand, price, year, fuel_type, speed, image_url, description } = req.body;
    
    db.query(
        'INSERT INTO cars (name, brand, price, year, fuel_type, speed, image_url, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [name, brand, price, year, fuel_type, speed, image_url, description],
        (err, result) => {
            if (err) {
                res.status(500).json({ success: false, error: err.message });
            } else {
                res.json({ success: true, message: 'Thêm xe thành công', id: result.insertId });
            }
        }
    );
});

app.put('/api/admin/cars/:id', authenticateToken, isAdmin, (req, res) => {
    const id = req.params.id;
    const { name, brand, price, year, fuel_type, speed, image_url, description } = req.body;
    
    db.query(
        'UPDATE cars SET name=?, brand=?, price=?, year=?, fuel_type=?, speed=?, image_url=?, description=? WHERE id=?',
        [name, brand, price, year, fuel_type, speed, image_url, description, id],
        (err, result) => {
            if (err) {
                res.status(500).json({ success: false, error: err.message });
            } else {
                res.json({ success: true, message: 'Cập nhật thành công' });
            }
        }
    );
});

app.delete('/api/admin/cars/:id', authenticateToken, isAdmin, (req, res) => {
    const id = req.params.id;
    
    db.query('DELETE FROM cars WHERE id = ?', [id], (err, result) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, message: 'Xóa xe thành công' });
        }
    });
});

// Quản lý đơn hàng
app.get('/api/admin/orders', authenticateToken, isAdmin, (req, res) => {
    const { status, fromDate, toDate } = req.query;
    
    let sql = `
        SELECT o.*, u.fullname as user_name, u.email as user_email,
               COUNT(oi.id) as items_count
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
        sql += ' AND o.status = ?';
        params.push(status);
    }
    if (fromDate) {
        sql += ' AND DATE(o.created_at) >= ?';
        params.push(fromDate);
    }
    if (toDate) {
        sql += ' AND DATE(o.created_at) <= ?';
        params.push(toDate);
    }

    sql += ' GROUP BY o.id ORDER BY o.created_at DESC';
    
    db.query(sql, params, (err, results) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, orders: results });
        }
    });
});

app.get('/api/admin/orders/:orderId', authenticateToken, isAdmin, (req, res) => {
    const { orderId } = req.params;
    
    db.query(`
        SELECT o.*, u.fullname as user_name, u.email as user_email, u.phone as user_phone
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.id = ?
    `, [orderId], (err, orderResults) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }
        if (orderResults.length === 0) {
            return res.status(404).json({ success: false, message: 'Không tìm thấy đơn hàng' });
        }
        
        db.query(`
            SELECT oi.*, c.name as car_name, c.image_url
            FROM order_items oi
            JOIN cars c ON oi.car_id = c.id
            WHERE oi.order_id = ?
        `, [orderId], (err, itemsResults) => {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }
            res.json({ success: true, order: { ...orderResults[0], items: itemsResults } });
        });
    });
});

app.put('/api/admin/orders/:orderId/status', authenticateToken, isAdmin, (req, res) => {
    const { orderId } = req.params;
    const { status } = req.body;
    
    db.query('UPDATE orders SET status = ? WHERE id = ?', [status, orderId], (err, result) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, message: 'Cập nhật trạng thái thành công' });
        }
    });
});

app.delete('/api/admin/orders/:orderId', authenticateToken, isAdmin, (req, res) => {
    const { orderId } = req.params;
    
    db.query('DELETE FROM orders WHERE id = ?', [orderId], (err, result) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, message: 'Xóa đơn hàng thành công' });
        }
    });
});

// Thống kê đơn hàng
app.get('/api/admin/orders/stats/summary', authenticateToken, isAdmin, (req, res) => {
    db.query(`
        SELECT 
            COUNT(*) as total_orders,
            SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_orders,
            SUM(CASE WHEN status = 'confirmed' THEN 1 ELSE 0 END) as confirmed_orders,
            SUM(CASE WHEN status = 'shipping' THEN 1 ELSE 0 END) as shipping_orders,
            SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed_orders,
            SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled_orders,
            SUM(total_amount) as total_revenue
        FROM orders
    `, (err, results) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, stats: results[0] });
        }
    });
});

// ==================== API ĐÁNH GIÁ ====================

// Tạo đánh giá
app.post('/api/reviews', authenticateToken, (req, res) => {
    const { car_id, rating, comment } = req.body;
    const user_id = req.user.id;

    db.query(`
        SELECT o.* FROM orders o
        JOIN order_items oi ON o.id = oi.order_id
        WHERE o.user_id = ? AND oi.car_id = ? AND o.status = 'completed'
    `, [user_id, car_id], (err, orders) => {
        if (err) {
            return res.status(500).json({ success: false, error: err.message });
        }

        if (orders.length === 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Bạn chỉ có thể đánh giá xe đã mua và đã hoàn thành đơn hàng' 
            });
        }

        db.query('SELECT * FROM reviews WHERE user_id = ? AND car_id = ?', [user_id, car_id], (err, existing) => {
            if (err) {
                return res.status(500).json({ success: false, error: err.message });
            }

            if (existing.length > 0) {
                return res.status(400).json({ 
                    success: false, 
                    message: 'Bạn đã đánh giá xe này rồi' 
                });
            }

            db.query(
                'INSERT INTO reviews (user_id, car_id, rating, comment, status) VALUES (?, ?, ?, ?, "pending")',
                [user_id, car_id, rating, comment],
                (err, result) => {
                    if (err) {
                        res.status(500).json({ success: false, error: err.message });
                    } else {
                        res.json({ 
                            success: true, 
                            message: 'Đánh giá đã được gửi và chờ duyệt' 
                        });
                    }
                }
            );
        });
    });
});

// Lấy đánh giá của user
app.get('/api/user/reviews', authenticateToken, (req, res) => {
    const user_id = req.user.id;
    
    db.query(`
        SELECT r.*, c.name as car_name, c.image_url
        FROM reviews r
        JOIN cars c ON r.car_id = c.id
        WHERE r.user_id = ?
        ORDER BY r.created_at DESC
    `, [user_id], (err, results) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, reviews: results });
        }
    });
});

// Lấy đánh giá của xe
app.get('/api/cars/:id/reviews', (req, res) => {
    const car_id = req.params.id;
    
    db.query(`
        SELECT r.*, u.fullname
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        WHERE r.car_id = ? AND r.status = 'approved'
        ORDER BY r.created_at DESC
    `, [car_id], (err, results) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, reviews: results });
        }
    });
});

// Quản lý đánh giá (admin)
app.get('/api/admin/reviews', authenticateToken, isAdmin, (req, res) => {
    const { status } = req.query;
    let sql = `
        SELECT r.*, u.fullname, u.email, c.name as car_name
        FROM reviews r
        JOIN users u ON r.user_id = u.id
        JOIN cars c ON r.car_id = c.id
        WHERE 1=1
    `;
    const params = [];

    if (status && status !== 'all') {
        sql += ' AND r.status = ?';
        params.push(status);
    }

    sql += ' ORDER BY r.created_at DESC';
    
    db.query(sql, params, (err, results) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, reviews: results });
        }
    });
});

app.put('/api/admin/reviews/:id', authenticateToken, isAdmin, (req, res) => {
    const id = req.params.id;
    const { status } = req.body;
    
    db.query('UPDATE reviews SET status = ? WHERE id = ?', [status, id], (err, result) => {
        if (err) {
            res.status(500).json({ success: false, error: err.message });
        } else {
            res.json({ success: true, message: 'Cập nhật trạng thái đánh giá thành công' });
        }
    });
});

// ==================== CHẠY SERVER ====================
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`🚀 Server đang chạy tại http://localhost:${PORT}`);
});

module.exports = app;