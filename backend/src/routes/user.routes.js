import express from "express";
import multer from "multer";
import { body } from "express-validator";
import prisma from "../config/db.js";
import cloudinary from "../config/cloudinary.js";
import { verifyToken } from "../middlewares/auth.middleware.js";
import { validate } from "../middlewares/validate.middleware.js";
const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      "image/jpeg",
      "image/png",
      "image/webp"
    ];

    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error("Only JPEG, PNG, and WebP images are allowed.")
      );
    }

    cb(null, true);
  }
});

const uploadBufferToCloudinary = (buffer, options = {}) => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      options,
      (error, result) => {
        if (error) {
          return reject(error);
        }

        resolve(result);
      }
    );

    stream.end(buffer);
  });
};
router.patch("/me/profile", verifyToken, [
	body("displayName").optional().isString().trim().isLength({ min: 2, max: 100 }),
	body("bio").optional({ nullable: true }).isString().isLength({ max: 2000 }),
	body("profileImage").optional({ nullable: true }).isURL({ protocols: ["http", "https"] }),
	body("bannerImage").optional({ nullable: true }).isURL({ protocols: ["http", "https"] }),
	body("spotifyLink").optional({ nullable: true }).isURL({ protocols: ["http", "https"] }),
	body("socialLinks").optional().isArray({ max: 20 }),
	body("socialLinks.*.label").optional().isString().trim().isLength({ min: 1, max: 40 }),
	body("socialLinks.*.url").optional().isURL({ protocols: ["http", "https"] })
], validate, async (req, res) => {
	try {
		const allowedFields = ["displayName", "bio", "profileImage", "bannerImage", "spotifyLink", "socialLinks"];
		const data = Object.fromEntries(
			allowedFields
				.filter((field) => Object.prototype.hasOwnProperty.call(req.body, field))
				.map((field) => [field, req.body[field]])
		);

		const updatedUser = await prisma.user.update({
			where: { id: req.user.id },
			data,
			select: {
				id: true,
				username: true,
				displayName: true,
				email: true,
				profileImage: true,
				bannerImage: true,
				spotifyLink: true,
				socialLinks: true,
				bio: true,
				selectedStyle: true,
				role: true
			}
		});

		return res.json({ user: updatedUser });
	} catch (error) {
		console.error("Profile update error:", error);
		return res.status(500).json({ error: "Failed to update profile." });
	}
});
router.post(
  "/me/banner-image",
  verifyToken,
  (req, res, next) => {
    upload.single("bannerImage")(req, res, (error) => {
      if (!error) {
        return next();
      }

      if (
        error instanceof multer.MulterError &&
        error.code === "LIMIT_FILE_SIZE"
      ) {
        return res.status(413).json({
          error: "Banner image must be 5MB or smaller."
        });
      }

      return res.status(400).json({
        error: error.message || "Invalid image upload."
      });
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "Banner image is required."
        });
      }

      const result = await uploadBufferToCloudinary(
        req.file.buffer,
        {
          folder: "debsoc/banner-images",
          public_id: req.user.id,
          overwrite: true,
          invalidate: true,
          resource_type: "image",
          transformation: [
            {
              width: 1600,
              height: 500,
              crop: "fill",
              gravity: "auto"
            },
            {
              quality: "auto",
              fetch_format: "auto"
            }
          ]
        }
      );

      const updatedUser = await prisma.user.update({
        where: {
          id: req.user.id
        },
        data: {
          bannerImage: result.secure_url
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          email: true,
          profileImage: true,
          bannerImage: true,
          spotifyLink: true,
          socialLinks: true,
          bio: true,
          selectedStyle: true,
          role: true
        }
      });

      return res.json({
        message: "Banner image uploaded successfully.",
        user: updatedUser
      });
    } catch (error) {
      console.error("Banner image upload error:", error);

      return res.status(500).json({
        error: "Failed to upload banner image."
      });
    }
  }
);

// Member directory / search. Only public profile fields are returned.
router.get("/", async (req, res) => {
	try {
		const q = String(req.query.q || "").trim().slice(0, 50);
		const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 60, 1), 100);
		const where = {
			isVerified: true,
			...(q ? {
				OR: [
					{ username: { contains: q, mode: "insensitive" } },
					{ displayName: { contains: q, mode: "insensitive" } }
				]
			} : {})
		};
		const users = await prisma.user.findMany({
			where,
			orderBy: { displayName: "asc" },
			take: limit,
			select: { username: true, displayName: true, profileImage: true, role: true, socialLinks: true }
		});
		res.json({ users });
	} catch (error) {
		console.error("Member list error:", error);
		res.status(500).json({ error: "Failed to load members." });
	}
});

router.get("/:username", async (req, res) => {
	try {
		const username = String(req.params.username || "").trim();
		if (!username) return res.status(400).json({ error: "Username is required." });

		const user = await prisma.user.findUnique({
			where: { username },
			select: {
				id: true,
				username: true,
				displayName: true,
				profileImage: true,
				bannerImage: true,
				spotifyLink: true,
				socialLinks: true,
				bio: true,
				selectedStyle: true,
				role: true,
				achievements: {
					orderBy: { awardedAt: "desc" },
					select: {
						id: true,
						position: true,
						awardedAt: true,
						event: { select: { title: true, eventDate: true, location: true, coverImage: true } },
						history: { select: { title: true, eventDate: true, location: true, coverImage: true } }
					}
				},
				_count: { select: { registrations: true, comments: true } }
			}
		});

		if (!user) return res.status(404).json({ error: "Profile not found." });

		res.json(user);
	} catch (error) {
		console.error("Profile lookup error:", error);
		res.status(500).json({ error: "Failed to load profile." });
	}
});

router.post(
  "/me/profile-image",
  verifyToken,
  (req, res, next) => {
    upload.single("profileImage")(req, res, (error) => {
      if (!error) {
        return next();
      }

      if (
        error instanceof multer.MulterError &&
        error.code === "LIMIT_FILE_SIZE"
      ) {
        return res.status(413).json({
          error: "Profile image must be 5MB or smaller."
        });
      }

      return res.status(400).json({
        error: error.message || "Invalid image upload."
      });
    });
  },
  async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          error: "Profile image is required."
        });
      }

      const result = await uploadBufferToCloudinary(
        req.file.buffer,
        {
          folder: "debsoc/profile-images",
          public_id: req.user.id,
          overwrite: true,
          invalidate: true,
          resource_type: "image",
          transformation: [
            {
              width: 500,
              height: 500,
              crop: "fill",
              gravity: "auto"
            },
            {
              quality: "auto",
              fetch_format: "auto"
            }
          ]
        }
      );

      const updatedUser = await prisma.user.update({
        where: {
          id: req.user.id
        },
        data: {
          profileImage: result.secure_url
        },
        select: {
          id: true,
          username: true,
          displayName: true,
          email: true,
          profileImage: true,
          bannerImage: true,
          spotifyLink: true,
          socialLinks: true,
          bio: true,
          selectedStyle: true,
          role: true
        }
      });

      return res.json({
        message: "Profile image uploaded successfully.",
        user: updatedUser
      });
    } catch (error) {
      console.error("Profile image upload error:", error);

      return res.status(500).json({
        error: "Failed to upload profile image."
      });
    }
  }
);

export default router;
