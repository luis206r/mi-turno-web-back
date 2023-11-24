const express = require("express");
const router = express.Router();
const Branch = require("../models/Branch");
const User = require("../models/Users");
const Appointment = require("../models/Appointment");
const { generateToken } = require("../config/tokens");
const { validateAuth } = require("../controllers/auth");


// tus rutas aqui
// ... exitoooos! 😋

router.post("/login", (req, res, next) => {
  const { email, password } = req.body;

  User.findOne({
    where: { email },
  }).then((user) => {
    if (!user) return res.sendStatus(401);

    user.validatePassword(password).then((isOk) => {
      if (!isOk) return res.sendStatus(401);
      const payload = {
        nameAndLast_name: user.nameAndLast_name,
        DNI: user.DNI,
        email,
        isAdmin: user.isAdmin,
        isOperator: user.isOperator,
      };
      const token = generateToken(payload);
      res.cookie("token", token).send(payload);
    });
  });
});

//RUTA DE AUTENTICACIÓN PARA LA PERSISTENCIA----------------------

router.get("/me", validateAuth, (req, res) => {
  res.send(req.user);
});

router.post("/register", (req, res) => {
  const { nameAndLast_name, DNI, email, password, isOperator, isAdmin } =
    req.body;
  User.findOne({ where: { email } }).then((user) => {
    if (user) {
      return res
        .status(400)
        .json({ error: "El correo electrónico ya está registrado." });
    }
    return User.create({
      nameAndLast_name,
      DNI,
      email,
      password,
      isOperator,
      isAdmin,
    })
      .then((user) => {
        res.status(201).json(user);
      })
      .catch((err) => {
        console.error(err);
        res.status(500).json({ error: "Error interno del servidor." });
      });
  });
});

router.get("/operators", (req, res) => {
  User.findAll({
    where: {
      isOperator: true,
    },
  })
    .then((operators) => res.status(200).send(operators))
    .catch((error) => {
      console.error("Error al obtener la lista de operadores:", error);
      res.status(500).send("Error interno del servidor");
    });
});

router.put("/removeOperator", (req, res) => {
  const { operatorId } = req.body;
  Branch.findOne({
    where: {
      operatorId: operatorId,
    },
  })
    .then((branch) => {
      if (branch) {
        return branch.setOperator(null);
      }
    })
    .then(() => {
      return User.destroy({
        where: {
          id: operatorId,
        },
      });
    })
    .then(() => {
      console.log("Se eliminó el operador");
      res.status(200).send("Operador eliminado con éxito");
    })
    .catch((error) => {
      console.error("Error al eliminar operador:", error);
      res.status(500).send("Error interno del servidor");
    });
});

router.put("/edit/profile", (req, res) => {
  User.update(req.body, {
    returning: true,
    where: {
      email: req.body.email,
    },
    individualHooks: true,
  })
    .then(([affectedRows, response]) => res.status(202).send(response[0]))
    .catch((err) => console.error(err));
});
router.post("/logout", (req, res) => {
  res.clearCookie("token");
  res.sendStatus(200);
});

router.post("/newOperator", (req, res) => {
  User.create(req.body)
    .then((user) => {
      res.statusCode = 201;
      res.send(user);
    })
    .catch((error) => console.log(error));
});

router.post("/newAppointment", (req, res) => {
  User.update(
    { telephone: req.body.telephone },
    {
      where: { email: req.body.email },
      returning: true,
      plain: true,
    }
  )
    .then((user) => {
      if (user[0] === 0 || !user[1])
        return res.status(404).json({ error: "no such user in database" });

      Appointment.create({
        branchId: req.body.branchId,
        branchName: req.body.branchName,
        date: req.body.date,
        schedule: req.body.schedule,
      })
        .then((appointment) => {
          appointment.setCreatedBy(user[1]);
          res.send(appointment);
        })
        .catch((error) => console.log(error));
    })
    .catch((error) => console.log("no such user in database", error));
});

router.put("/newAppointment", (req, res) => {
  User.update(req.body, {
    where: { email: req.body.email },
    returning: true,
    plain: true,
  });
  Appointment.update(req.body, {
    where: {
      reservationId: req.body.reservationId,
    },

    returning: true,
  })
    .then((resp) => {
      res.statusCode = 201;
      res.send(resp);
    })
    .catch((error) => console.log(error));
});

router.get("/appointment/:reservationId", (req, res) => {
  Appointment.findOne({
    where: {
      reservationId: req.params.reservationId,
    },
    include: [
      { model: User, as: "createdBy" },
      { model: Branch, as: "branch" },
    ],
  })
    .then((rsv) => {
      if (rsv) {
        res.status(200).send(rsv);
      } else {
        res.status(404).send("No se encontró la reserva");
      }
    })
    .catch((error) => {
      console.error("Error al obtener la reserva:", error);
      res.status(500).send("Error interno del servidor");
    });
});

router.delete("/removeAppointment/:reservationId", (req, res) => {
  Appointment.destroy({
    where: {
      reservationId: req.params.reservationId,
    },
  })
    .then(() => {
      res.status(204).send("Se removió la reserva");
    })
    .catch((error) => {
      console.error("Error al eliminar la reserva:", error);
      res.status(500).send("Error interno del servidor");
    });
});

router.get("/appointmentList/:dni", (req, res) => {
  console.log(req.params)
  User.findOne({
    where: {
      DNI: parseInt(req.params.dni)
    }
  })
    .then((user) => {
      Appointment.findAll({
        where: {
          userId: user.id,
        },
        include: [{ model: Branch, as: "branch" }],
      }).then((list) => {
        if (list) {
          res.status(200).send(list);
        } else {
          res.status(404).send("No se encontró la reserva");
        }
      });
    })
    .catch((error) => {
      console.error("Error al buscar las reserva:", error);
      res.status(500).send("Error interno del servidor");
    });
});

router.get("/operator/reservationsList", (req, res) => {
  User.findOne({ where: req.body }).then((user) => {
    Appointment.findAll({
      where: { userId: user.id },
      include: [
        { model: User, as: "createdBy" },
        { model: Branch, as: "branch" },
      ],
    })
      .then((list) => {
        res.status(200).send(list);
      })
      .catch((error) => {
        console.error("Error al buscar la lista de reservas:", error);
        res.status(500).send("Error interno del servidor");
      });
  });
});

router.get("/admin/sucursalesList", (req, res) => {
  Branch.findAll({
    include: [{ model: User, as: "operator" }],
  })
    .then((branches) => {
      res.status(200).send(branches);
    })
    .catch((error) => {
      console.error("Error al buscar la lista sucursales", error);
      res.status(500).send("Error interno del servidor");
    });
});

module.exports = router;
