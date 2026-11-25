from django.db import migrations


class Migration(migrations.Migration):
    dependencies = [('catalog', '0006_motif_garment_exclusions')]
    operations = [
        migrations.RemoveField(model_name='motif', name='offer_mode'),
        migrations.RemoveField(model_name='motif', name='allowed_product_types'),
        migrations.RemoveField(model_name='motif', name='allowed_colors'),
        migrations.DeleteModel(name='MotifVariant'),
    ]
